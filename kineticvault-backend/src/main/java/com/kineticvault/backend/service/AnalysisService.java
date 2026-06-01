package com.kineticvault.backend.service;

import com.kineticvault.backend.dto.AnalyzeResponse;
import com.kineticvault.backend.model.Message;
import com.kineticvault.backend.model.Report;
import com.kineticvault.backend.repository.MessageRepository;
import com.kineticvault.backend.repository.ReportRepository;
import com.kineticvault.backend.util.SensitiveValueSanitizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Core analysis service that orchestrates AI analysis, entity extraction,
 * and result persistence.
 */
@Service
public class AnalysisService {
    private static final Logger logger = LoggerFactory.getLogger(AnalysisService.class);

    private final MietAiService mietAiService;
    private final EntityExtractorService entityExtractorService;
    private final MessageRepository messageRepository;
    private final ReportRepository reportRepository;

    public AnalysisService(MietAiService mietAiService,
                           EntityExtractorService entityExtractorService,
                           MessageRepository messageRepository,
                           ReportRepository reportRepository) {
        this.mietAiService = mietAiService;
        this.entityExtractorService = entityExtractorService;
        this.messageRepository = messageRepository;
        this.reportRepository = reportRepository;
    }

    /**
     * Analyzes a message for threats using AI + rule-based entity extraction.
     */
    public AnalyzeResponse analyzeMessage(String messageContent) {
        String safeContent = messageContent == null ? "" : messageContent;

        // 1. Call MIET AI Gateway for threat analysis. The AI service returns a
        // validated object or a rule-based fallback, never null.
        Map<String, Object> aiResult = safeMap(mietAiService.analyzeMessage(safeContent));

        // 2. Extract entities using regex patterns
        Map<String, Object> entities = safeMap(entityExtractorService.extractEntities(safeContent));

        // 3. Mask sensitive data in content before saving
        String maskedContent = maskSensitiveData(safeContent);

        int riskScore = clamp(getIntValue(aiResult, "riskScore"), 0, 100);
        String threatLevel = normalizeThreatLevel(getStringValue(aiResult, "threatLevel"), riskScore);
        boolean isThreat = getBooleanValue(aiResult, "isThreat", riskScore > 40);
        List<String> threats = getStringList(aiResult, "threats");
        List<Map<String, Object>> keywords = getKeywordList(aiResult, riskScore, threats);
        String explanation = getStringValue(aiResult, "explanation");

        if (explanation.isBlank()) {
            explanation = isThreat
                    ? "Suspicious scam indicators were detected in this message."
                    : "No scam indicators were detected in this message.";
        }

        // 4. Build and save Message document
        Message message = new Message();
        message.setContent(maskedContent);
        message.setRiskScore(riskScore);
        message.setThreatLevel(threatLevel);
        message.setKeywords(keywords);
        message.setEntities(entities);
        message.setExplanation(explanation);
        message.setCreatedAt(LocalDateTime.now());

        Message saved = saveMessageSafely(message);

        // 5. Build response DTO
        AnalyzeResponse response = new AnalyzeResponse();
        response.setId(saved.getId());
        response.setThreat(isThreat);
        response.setRiskScore(saved.getRiskScore());
        response.setThreatLevel(saved.getThreatLevel());
        response.setThreats(threats);
        response.setKeywords(saved.getKeywords());
        response.setEntities(saved.getEntities());
        response.setExplanation(saved.getExplanation());
        response.setCreatedAt(saved.getCreatedAt().toString());

        return response;
    }

    /**
     * Returns all messages ordered by most recent first.
     */
    public List<Message> getHistory() {
        return messageRepository.findAllByOrderByCreatedAtDesc();
    }

    /**
     * Creates or retrieves a report for a given messageId.
     */
    public Report generateReport(String messageId) {
        // Check for existing report
        Optional<Report> existing = reportRepository.findByMessageId(messageId);
        if (existing.isPresent()) {
            return existing.get();
        }

        // Fetch the original message
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new RuntimeException("Message not found with id: " + messageId));

        // Build report
        Report report = new Report();
        report.setMessageId(messageId);
        report.setReportId(UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        report.setRiskLevel(message.getThreatLevel());

        // Build analysis object
        Map<String, Object> analysis = new HashMap<>();
        analysis.put("riskScore", message.getRiskScore());
        analysis.put("threatLevel", message.getThreatLevel());
        analysis.put("keywords", message.getKeywords());
        analysis.put("entities", message.getEntities());
        analysis.put("explanation", message.getExplanation());
        analysis.put("originalContent", message.getContent());
        report.setAnalysis(analysis);

        report.setCreatedAt(LocalDateTime.now());

        return reportRepository.save(report);
    }

    /**
     * Masks sensitive data like phone numbers and UPI IDs.
     */
    private String maskSensitiveData(String content) {
        // Mask phone numbers partially
        content = content.replaceAll("(\\d{3})\\d{4}(\\d{3})", "$1****$2");
        return content;
    }

    private Message saveMessageSafely(Message message) {
        try {
            return messageRepository.save(message);
        } catch (Exception e) {
            logger.error("Failed to save analysis history. Returning analysis response without persistence ({}): {}",
                    e.getClass().getSimpleName(), SensitiveValueSanitizer.sanitize(e.getMessage()));
            return message;
        }
    }

    private int getIntValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        if (value != null) {
            try {
                return (int) Math.round(Double.parseDouble(value.toString().replace("%", "").trim()));
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }

    private String getStringValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value != null ? value.toString() : "";
    }

    private boolean getBooleanValue(Map<String, Object> map, String key, boolean defaultValue) {
        Object value = map.get(key);
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value != null) {
            String text = value.toString().trim().toLowerCase(Locale.ROOT);
            if (Set.of("true", "yes", "1", "threat", "scam").contains(text)) {
                return true;
            }
            if (Set.of("false", "no", "0", "safe", "none").contains(text)) {
                return false;
            }
        }
        return defaultValue;
    }

    private List<String> getStringList(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (!(value instanceof List<?> list)) {
            return new ArrayList<>();
        }
        List<String> strings = new ArrayList<>();
        for (Object item : list) {
            if (item != null && !item.toString().isBlank()) {
                strings.add(item.toString());
            }
        }
        return strings;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> getKeywordList(Map<String, Object> map,
                                                     int riskScore,
                                                     List<String> threats) {
        Object value = map.get("keywords");
        List<Map<String, Object>> keywords = new ArrayList<>();

        if (value instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> keywordMap) {
                    Map<String, Object> keyword = new LinkedHashMap<>();
                    keywordMap.forEach((mapKey, mapValue) -> keyword.put(Objects.toString(mapKey), mapValue));
                    keyword.putIfAbsent("word", "Suspicious indicator");
                    keyword.put("confidence", clamp(getObjectInt(keyword.get("confidence"), confidenceForScore(riskScore)), 0, 100));
                    keyword.putIfAbsent("type", "threat");
                    keywords.add(keyword);
                } else if (item != null && !item.toString().isBlank()) {
                    keywords.add(keyword(item.toString(), confidenceForScore(riskScore), "threat"));
                }
            }
        }

        if (keywords.isEmpty() && riskScore > 20) {
            for (String threat : threats) {
                keywords.add(keyword(threat, confidenceForScore(riskScore), "threat"));
            }
        }

        return keywords;
    }

    private Map<String, Object> keyword(String word, int confidence, String type) {
        Map<String, Object> keyword = new LinkedHashMap<>();
        keyword.put("word", word);
        keyword.put("confidence", confidence);
        keyword.put("type", type);
        return keyword;
    }

    private int getObjectInt(Object value, int defaultValue) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            try {
                return (int) Math.round(Double.parseDouble(value.toString().replace("%", "").trim()));
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    private int confidenceForScore(int riskScore) {
        if (riskScore > 80) {
            return 95;
        }
        if (riskScore > 60) {
            return 88;
        }
        if (riskScore > 40) {
            return 78;
        }
        return 60;
    }

    private String normalizeThreatLevel(String threatLevel, int riskScore) {
        if (riskScore >= 81) {
            return "CRITICAL";
        }
        if (riskScore >= 61) {
            return "HIGH";
        }
        if (riskScore >= 41) {
            return "MEDIUM";
        }
        if (riskScore >= 21) {
            return "LOW";
        }

        String normalized = threatLevel == null ? "" : threatLevel.trim().toUpperCase(Locale.ROOT);
        if (Set.of("NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL").contains(normalized)) {
            return normalized;
        }
        return "NONE";
    }

    private Map<String, Object> safeMap(Map<String, Object> map) {
        return map == null ? new HashMap<>() : map;
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
