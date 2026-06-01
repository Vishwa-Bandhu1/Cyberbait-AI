package com.kineticvault.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kineticvault.backend.util.SensitiveValueSanitizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MietAiService {
    private static final Logger logger = LoggerFactory.getLogger(MietAiService.class);
    private static final String DEFAULT_API_URL = "https://ai-services.mietjmu.in/gateway/llm/chat";
    private static final String DEFAULT_MODEL = "gpt-oss:20b";
    private static final int MAX_ATTEMPTS = 3;
    private static final int AI_TIMEOUT_SECONDS = 25;
    private static final int LOG_PREVIEW_LENGTH = 900;
    private static final Pattern URL_PATTERN = Pattern.compile(
            "\\b((?:https?://|www\\.)[^\\s<>\"']+|[a-z0-9][a-z0-9-]{1,63}(?:\\.[a-z]{2,})(?:/[^\\s<>\"']*)?)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Set<String> TRUSTED_DOMAINS = Set.of(
            "swiggy.com", "zomato.com", "amazon.in", "amazon.com", "flipkart.com",
            "myntra.com", "google.com", "paytm.com", "phonepe.com", "razorpay.com",
            "sbi.co.in", "onlinesbi.sbi", "hdfcbank.com", "icicibank.com",
            "axisbank.com", "kotak.com", "bankofbaroda.in", "pnbindia.in"
    );
    private static final Set<String> SHORTENER_DOMAINS = Set.of(
            "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly",
            "shorturl.at", "rebrand.ly", "lnkd.in", "ow.ly", "buff.ly"
    );

    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final String apiUrl;
    private final String apiToken;
    private final String model;

    public MietAiService(WebClient.Builder webClientBuilder,
                           ObjectMapper objectMapper,
                           @Value("${ai.gateway.url:}") String apiUrl,
                           @Value("${ai.gateway.token:}") String apiToken,
                           @Value("${ai.gateway.model:}") String model) {
        this.webClient = webClientBuilder.build();
        this.objectMapper = objectMapper;
        this.apiUrl = apiUrl == null || apiUrl.isBlank() ? DEFAULT_API_URL : apiUrl;
        this.apiToken = apiToken;
        this.model = model == null || model.isBlank() ? DEFAULT_MODEL : model;
    }

    /**
     * Analyzes a message using MIET AI Gateway and returns structured threat analysis.
     */
    public Map<String, Object> analyzeMessage(String message) {
        String messageText = message == null ? "" : message.trim();
        Map<String, Object> ruleBasedFallback = buildRuleBasedAnalysis(messageText,
                "AI service was unavailable, so Kinetic Vault used local scam detection rules.");

        if (apiToken == null || apiToken.isBlank()) {
            logger.warn("AI Gateway token is not configured. Using rule-based analysis.");
            return ruleBasedFallback;
        }

        Exception lastFailure = null;

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                Map<String, Object> requestBody = buildRequestBody(messageText);

                logger.info("Calling MIET AI Gateway attempt {}/{} with model '{}' via {}",
                        attempt, MAX_ATTEMPTS, model, apiUrl);

                String responseBody = webClient.post()
                        .uri(apiUrl)
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiToken)
                        .bodyValue(requestBody)
                        .retrieve()
                        .bodyToMono(String.class)
                        .timeout(Duration.ofSeconds(AI_TIMEOUT_SECONDS))
                        .block();

                logger.info("MIET AI raw response preview: {}",
                        SensitiveValueSanitizer.sanitize(preview(responseBody)));

                Map<String, Object> aiAnalysis = parseAiResponse(responseBody, messageText);
                return strengthenWithRules(aiAnalysis, ruleBasedFallback);

            } catch (WebClientResponseException e) {
                lastFailure = e;
                logger.warn("AI Gateway HTTP error on attempt {}/{}: status={} body={}",
                        attempt, MAX_ATTEMPTS, e.getStatusCode().value(),
                        SensitiveValueSanitizer.sanitize(preview(e.getResponseBodyAsString())));
                if (!isRetryableStatus(e.getStatusCode().value()) || attempt == MAX_ATTEMPTS) {
                    break;
                }
                sleepBeforeRetry(attempt);
            } catch (Exception e) {
                lastFailure = e;
                logger.warn("AI Gateway analysis failed on attempt {}/{}: {}",
                        attempt, MAX_ATTEMPTS, SensitiveValueSanitizer.sanitize(e.getMessage()));
                if (attempt == MAX_ATTEMPTS) {
                    break;
                }
                sleepBeforeRetry(attempt);
            }
        }

        logger.error("AI Gateway unavailable after {} attempts. Falling back to local analysis. Last error: {}",
                MAX_ATTEMPTS, lastFailure == null ? "unknown" : SensitiveValueSanitizer.sanitize(lastFailure.getMessage()));
        return ruleBasedFallback;
    }

    private Map<String, Object> buildRequestBody(String message) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", model);
        
        List<Map<String, String>> messages = new ArrayList<>();
        
        String systemPrompt = """
                You are Kinetic Vault's SMS scam and phishing classifier for Indian users.

                Return ONLY one valid JSON object. Do not use markdown, prose, comments, or code fences.
                Required schema:
                {
                  "isThreat": true,
                  "riskScore": 85,
                  "riskLevel": "HIGH",
                  "reason": "Phishing link detected with urgent banking language.",
                  "threats": ["Suspicious URL", "Banking scam", "Urgency tactics"]
                }

                Scoring:
                - 0-20 NONE: normal transactional or personal messages with no scam signals.
                - 21-40 LOW: weak suspicious wording but no clear fraud action.
                - 41-60 MEDIUM: suspicious link, unknown sender pressure, or data request.
                - 61-80 HIGH: banking/KYC/payment/OTP scam language, APK install request, or urgent threat.
                - 81-100 CRITICAL: phishing URL plus banking/payment/OTP/KYC urgency, credential theft, or malware APK.

                Detect these strongly: suspicious URLs, OTP theft, banking scams, fake KYC, fake account blocks,
                urgent payment demands, lottery/prize scams, APK download/install scams, phishing login pages,
                refund scams, UPI fraud, CVV/PIN/password requests, impersonation, and social engineering.

                If the message includes a URL and asks the user to verify, login, update KYC, pay, claim,
                install an APK, share OTP/PIN/CVV/password, or avoid account blocking, classify it as HIGH or CRITICAL.
                Keep safe delivery/order/status notifications LOW or NONE unless they include scam actions.
                """;
                
        messages.add(Map.of("role", "system", "content", systemPrompt));
        messages.add(Map.of("role", "user", "content", message));
        
        requestBody.put("messages", messages);
        requestBody.put("temperature", 0.2);
        
        return requestBody;
    }

    private Map<String, Object> parseAiResponse(String responseBody, String originalMessage) {
        if (responseBody == null || responseBody.isBlank()) {
            throw new IllegalArgumentException("AI Gateway returned an empty response body");
        }

        List<JsonNode> candidateNodes = new ArrayList<>();
        List<String> candidateTexts = new ArrayList<>();

        JsonNode root = tryReadTree(responseBody);
        if (root != null) {
            collectAnalysisNodes(root, candidateNodes);
            collectTextNodes(root, candidateTexts);
        } else {
            candidateTexts.add(responseBody);
        }

        for (JsonNode candidate : candidateNodes) {
            Optional<Map<String, Object>> normalized = normalizeAiNode(candidate);
            if (normalized.isPresent()) {
                logger.info("MIET AI structured analysis parsed from JSON object.");
                return normalized.get();
            }
        }

        for (String text : candidateTexts) {
            String cleaned = cleanModelText(text);
            JsonNode textNode = tryReadTree(cleaned);
            if (textNode == null) {
                String jsonObject = extractFirstJsonObject(cleaned);
                textNode = jsonObject == null ? null : tryReadTree(jsonObject);
            }

            if (textNode != null) {
                List<JsonNode> textCandidates = new ArrayList<>();
                collectAnalysisNodes(textNode, textCandidates);
                if (textCandidates.isEmpty()) {
                    textCandidates.add(textNode);
                }

                for (JsonNode candidate : textCandidates) {
                    Optional<Map<String, Object>> normalized = normalizeAiNode(candidate);
                    if (normalized.isPresent()) {
                        logger.info("MIET AI structured analysis parsed from text content.");
                        return normalized.get();
                    }
                }
            }
        }

        logger.warn("AI response did not contain parseable structured JSON. Response preview: {}",
                SensitiveValueSanitizer.sanitize(preview(responseBody)));
        return buildRuleBasedAnalysis(originalMessage,
                "AI returned malformed text, so Kinetic Vault used local scam detection rules.");
    }

    private Optional<Map<String, Object>> normalizeAiNode(JsonNode node) {
        if (node == null || !node.isObject() || !looksLikeAnalysis(node)) {
            return Optional.empty();
        }

        Optional<Integer> scoreValue = readInt(node,
                "riskScore", "risk_score", "score", "risk", "confidence");
        String levelValue = readText(node,
                "riskLevel", "risk_level", "threatLevel", "threat_level", "level", "severity");
        Optional<Boolean> threatValue = readBoolean(node,
                "isThreat", "is_threat", "threat", "malicious", "scam", "phishing");

        int riskScore = scoreValue.orElseGet(() -> scoreFromLevel(levelValue));
        if (threatValue.orElse(false) && riskScore < 41) {
            riskScore = 65;
        }
        if (riskScore == 0 && threatValue.isPresent() && !threatValue.get()) {
            riskScore = 5;
        }
        int levelFloor = scoreFromLevel(levelValue);
        if (levelFloor > riskScore) {
            riskScore = levelFloor;
        }

        riskScore = clamp(riskScore, 0, 100);
        String threatLevel = levelFromScore(riskScore);
        boolean isThreat = threatValue.orElse(riskScore > 40);

        List<String> threats = normalizeThreats(node);
        List<Map<String, Object>> keywords = normalizeKeywords(node, threats, riskScore);
        String explanation = readText(node, "reason", "explanation", "analysis", "summary", "message", "details");
        if (explanation.isBlank()) {
            explanation = isThreat
                    ? "Suspicious scam indicators were detected in this message."
                    : "No scam indicators were detected in this message.";
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("isThreat", isThreat);
        result.put("riskScore", riskScore);
        result.put("riskLevel", threatLevel);
        result.put("threatLevel", threatLevel);
        result.put("reason", explanation);
        result.put("explanation", explanation);
        result.put("threats", threats);
        result.put("keywords", keywords);
        result.put("analysisSource", "AI");
        return Optional.of(result);
    }

    private Map<String, Object> strengthenWithRules(Map<String, Object> aiAnalysis,
                                                     Map<String, Object> ruleAnalysis) {
        Map<String, Object> normalizedAi = aiAnalysis == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(aiAnalysis);
        int aiScore = clamp(toInt(normalizedAi.get("riskScore")).orElse(0), 0, 100);
        int ruleScore = clamp(toInt(ruleAnalysis.get("riskScore")).orElse(5), 0, 100);

        Map<String, Object> selected = aiScore >= ruleScore
                ? normalizedAi
                : new LinkedHashMap<>(ruleAnalysis);

        if (ruleScore > aiScore) {
            String aiExplanation = Objects.toString(normalizedAi.getOrDefault("explanation", ""), "");
            String ruleExplanation = Objects.toString(ruleAnalysis.getOrDefault("explanation", ""), "");
            selected.put("explanation", appendSentence(ruleExplanation,
                    "The AI response was lower confidence, so local scam indicators were used to avoid a false safe result."));
            selected.put("reason", selected.get("explanation"));
            selected.put("analysisSource", "AI_WITH_RULES");
            mergeKeywordLists(selected, ruleAnalysis);
            mergeThreatLists(selected, ruleAnalysis);
            if (!aiExplanation.isBlank()) {
                logger.info("AI analysis was strengthened by local rules. aiScore={} ruleScore={} aiReason={}",
                        aiScore, ruleScore, aiExplanation);
            } else {
                logger.info("AI analysis was strengthened by local rules. aiScore={} ruleScore={}", aiScore, ruleScore);
            }
        }

        int finalScore = clamp(toInt(selected.get("riskScore")).orElse(Math.max(aiScore, ruleScore)), 0, 100);
        String finalLevel = levelFromScore(finalScore);
        selected.put("riskScore", finalScore);
        selected.put("riskLevel", finalLevel);
        selected.put("threatLevel", finalLevel);
        selected.put("isThreat", finalScore > 40);
        selected.putIfAbsent("keywords", new ArrayList<Map<String, Object>>());
        selected.putIfAbsent("threats", new ArrayList<String>());
        selected.putIfAbsent("explanation", finalScore > 40
                ? "Suspicious scam indicators were detected in this message."
                : "No scam indicators were detected in this message.");
        selected.putIfAbsent("reason", selected.get("explanation"));
        return selected;
    }

    private Map<String, Object> buildRuleBasedAnalysis(String message, String prefix) {
        String text = message == null ? "" : message;
        String lower = text.toLowerCase(Locale.ROOT);
        Map<String, Map<String, Object>> keywordMap = new LinkedHashMap<>();
        Set<String> threats = new LinkedHashSet<>();
        int score = text.isBlank() ? 10 : 5;

        List<String> urls = extractUrls(text);
        boolean hasUrl = !urls.isEmpty();
        boolean suspiciousUrl = false;
        for (String url : urls) {
            if (isSuspiciousUrl(url, lower)) {
                suspiciousUrl = true;
                break;
            }
        }
        if (hasUrl) {
            if (suspiciousUrl) {
                score += 45;
                addSignal(keywordMap, threats, "Suspicious URL", 92, "phishing");
            } else {
                score += 15;
                addSignal(keywordMap, threats, "URL present", 55, "link");
            }
        }

        if (matches(lower, "\\b(bank|account|debit|credit|card|netbanking|upi|wallet|transaction|aadhaar|aadhar|pan|kyc)\\b")) {
            score += 18;
            addSignal(keywordMap, threats, "Banking or KYC language", 88, "financial");
        }
        if (matches(lower, "\\b(otp|one time password|verification code|cvv|pin|password|login|credential)\\b")) {
            score += 25;
            addSignal(keywordMap, threats, "Credential or OTP request", 94, "credential_theft");
        }
        if (matches(lower, "\\b(verify|validate|update|reactivate|confirm|complete|unlock|restore)\\b")) {
            score += 16;
            addSignal(keywordMap, threats, "Verification request", 84, "phishing");
        }
        if (matches(lower, "\\b(blocked|suspended|deactivated|frozen|locked|expire|expires|penalty|legal action)\\b")) {
            score += 18;
            addSignal(keywordMap, threats, "Threat or account block warning", 88, "threat");
        }
        if (matches(lower, "\\b(immediately|urgent|today|now|within|last chance|act fast|limited time|final notice)\\b")) {
            score += 16;
            addSignal(keywordMap, threats, "Urgency tactics", 86, "urgency");
        }
        if (matches(lower, "\\b(pay now|payment due|payment failed|refund|claim|cashback|fine|fee|loan|emi|overdue)\\b")) {
            score += 16;
            addSignal(keywordMap, threats, "Payment or refund lure", 82, "financial");
        }
        if (matches(lower, "\\b(lottery|winner|won|prize|reward|gift card|jackpot|selected)\\b")) {
            score += 24;
            addSignal(keywordMap, threats, "Lottery or prize scam", 90, "social_engineering");
        }
        if (matches(lower, "\\b(apk|install app|download app|download now|side.?load|enable unknown sources)\\b")) {
            score += 32;
            addSignal(keywordMap, threats, "APK download request", 96, "malware");
        }
        if (matches(lower, "\\b(sbi|hdfc|icici|axis|pnb|kotak|paytm|phonepe|google pay|gpay|income tax|electricity|courier|delivery failed)\\b")
                && (hasUrl || matches(lower, "\\b(verify|kyc|blocked|pay|otp|login|update)\\b"))) {
            score += 14;
            addSignal(keywordMap, threats, "Brand impersonation", 82, "impersonation");
        }

        if (hasUrl && matches(lower, "\\b(bank|account|kyc|blocked|verify|login|otp|payment|apk|claim)\\b")) {
            score += 20;
        }
        if (matches(lower, "\\b(swiggy|zomato|delivered successfully|order has been delivered|order delivered)\\b")
                && !hasUrl
                && keywordMap.isEmpty()) {
            score = 5;
        }

        score = keywordMap.isEmpty() ? Math.min(score, 20) : clamp(score, 5, 100);
        String level = levelFromScore(score);
        boolean isThreat = score > 40;
        List<Map<String, Object>> keywords = new ArrayList<>(keywordMap.values());
        List<String> threatList = new ArrayList<>(threats);
        String explanation = buildRuleExplanation(prefix, isThreat, threatList);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("isThreat", isThreat);
        result.put("riskScore", score);
        result.put("riskLevel", level);
        result.put("threatLevel", level);
        result.put("reason", explanation);
        result.put("explanation", explanation);
        result.put("threats", threatList);
        result.put("keywords", keywords);
        result.put("analysisSource", "RULES");
        return result;
    }

    private void collectAnalysisNodes(JsonNode node, List<JsonNode> candidates) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return;
        }
        if (node.isObject() && looksLikeAnalysis(node)) {
            candidates.add(node);
        }
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> collectAnalysisNodes(entry.getValue(), candidates));
        } else if (node.isArray()) {
            node.forEach(child -> collectAnalysisNodes(child, candidates));
        }
    }

    private void collectTextNodes(JsonNode node, List<String> texts) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return;
        }
        if (node.isTextual()) {
            String text = node.asText();
            if (text.contains("{") || text.toLowerCase(Locale.ROOT).contains("risk")
                    || text.toLowerCase(Locale.ROOT).contains("threat")) {
                texts.add(text);
            }
            return;
        }
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> collectTextNodes(entry.getValue(), texts));
        } else if (node.isArray()) {
            node.forEach(child -> collectTextNodes(child, texts));
        }
    }

    private boolean looksLikeAnalysis(JsonNode node) {
        return findField(node, "riskScore", "risk_score", "riskLevel", "risk_level",
                "threatLevel", "threat_level", "isThreat", "is_threat", "threats",
                "keywords", "reason", "explanation").isPresent();
    }

    private Optional<JsonNode> findField(JsonNode node, String... names) {
        if (node == null || !node.isObject()) {
            return Optional.empty();
        }
        Set<String> normalizedNames = new HashSet<>();
        for (String name : names) {
            normalizedNames.add(normalizeKey(name));
        }
        Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            if (normalizedNames.contains(normalizeKey(field.getKey()))) {
                return Optional.ofNullable(field.getValue());
            }
        }
        return Optional.empty();
    }

    private Optional<Integer> readInt(JsonNode node, String... names) {
        Optional<JsonNode> value = findField(node, names);
        if (value.isEmpty() || value.get().isNull()) {
            return Optional.empty();
        }
        JsonNode jsonValue = value.get();
        if (jsonValue.isNumber()) {
            return Optional.of(jsonValue.asInt());
        }
        return toInt(jsonValue.asText());
    }

    private Optional<Boolean> readBoolean(JsonNode node, String... names) {
        Optional<JsonNode> value = findField(node, names);
        if (value.isEmpty() || value.get().isNull()) {
            return Optional.empty();
        }
        JsonNode jsonValue = value.get();
        if (jsonValue.isBoolean()) {
            return Optional.of(jsonValue.asBoolean());
        }
        String normalized = jsonValue.asText("").trim().toLowerCase(Locale.ROOT);
        if (Set.of("true", "yes", "y", "1", "threat", "scam", "phishing").contains(normalized)) {
            return Optional.of(true);
        }
        if (Set.of("false", "no", "n", "0", "safe", "none").contains(normalized)) {
            return Optional.of(false);
        }
        return Optional.empty();
    }

    private String readText(JsonNode node, String... names) {
        Optional<JsonNode> value = findField(node, names);
        if (value.isEmpty() || value.get().isNull()) {
            return "";
        }
        JsonNode jsonValue = value.get();
        if (jsonValue.isTextual()) {
            return jsonValue.asText("").trim();
        }
        if (jsonValue.isNumber() || jsonValue.isBoolean()) {
            return jsonValue.asText("").trim();
        }
        return jsonValue.toString();
    }

    private List<String> normalizeThreats(JsonNode node) {
        List<String> threats = new ArrayList<>();
        Optional<JsonNode> threatsNode = findField(node, "threats", "detectedThreats", "categories", "issues");
        threatsNode.ifPresent(value -> addThreatValues(value, threats));
        Optional<JsonNode> keywordsNode = findField(node, "keywords", "signals", "indicators");
        keywordsNode.ifPresent(value -> addThreatValues(value, threats));
        return dedupeStrings(threats);
    }

    private void addThreatValues(JsonNode value, List<String> threats) {
        if (value == null || value.isNull()) {
            return;
        }
        if (value.isArray()) {
            value.forEach(item -> addThreatValues(item, threats));
            return;
        }
        if (value.isTextual()) {
            String text = value.asText("").trim();
            if (!text.isBlank()) {
                threats.add(text);
            }
            return;
        }
        if (value.isObject()) {
            String word = readText(value, "word", "name", "label", "type", "threat", "category");
            if (!word.isBlank()) {
                threats.add(word);
            }
        }
    }

    private List<Map<String, Object>> normalizeKeywords(JsonNode node, List<String> threats, int riskScore) {
        List<Map<String, Object>> keywords = new ArrayList<>();
        Optional<JsonNode> keywordsNode = findField(node, "keywords", "signals", "indicators");

        if (keywordsNode.isPresent() && keywordsNode.get().isArray()) {
            keywordsNode.get().forEach(item -> {
                if (item.isTextual()) {
                    keywords.add(keyword(item.asText(), confidenceForScore(riskScore), "threat"));
                } else if (item.isObject()) {
                    String word = readText(item, "word", "name", "label", "phrase", "threat", "category");
                    if (!word.isBlank()) {
                        int confidence = readInt(item, "confidence", "score", "weight")
                                .orElse(confidenceForScore(riskScore));
                        String type = readText(item, "type", "category", "kind");
                        keywords.add(keyword(word, clamp(confidence, 0, 100), type.isBlank() ? "threat" : type));
                    }
                }
            });
        }

        if (keywords.isEmpty()) {
            for (String threat : threats) {
                keywords.add(keyword(threat, confidenceForScore(riskScore), inferType(threat)));
            }
        }

        return dedupeKeywords(keywords);
    }

    private void mergeKeywordLists(Map<String, Object> selected, Map<String, Object> extra) {
        List<Map<String, Object>> merged = new ArrayList<>();
        merged.addAll(asKeywordList(selected.get("keywords")));
        merged.addAll(asKeywordList(extra.get("keywords")));
        selected.put("keywords", dedupeKeywords(merged));
    }

    private void mergeThreatLists(Map<String, Object> selected, Map<String, Object> extra) {
        List<String> merged = new ArrayList<>();
        merged.addAll(asStringList(selected.get("threats")));
        merged.addAll(asStringList(extra.get("threats")));
        selected.put("threats", dedupeStrings(merged));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> asKeywordList(Object value) {
        if (!(value instanceof List<?> list)) {
            return new ArrayList<>();
        }
        List<Map<String, Object>> keywords = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> normalized = new LinkedHashMap<>();
                map.forEach((key, mapValue) -> normalized.put(Objects.toString(key), mapValue));
                keywords.add(normalized);
            } else if (item != null) {
                keywords.add(keyword(Objects.toString(item), 75, "threat"));
            }
        }
        return keywords;
    }

    private List<String> asStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return new ArrayList<>();
        }
        List<String> strings = new ArrayList<>();
        for (Object item : list) {
            if (item != null && !Objects.toString(item).isBlank()) {
                strings.add(Objects.toString(item));
            }
        }
        return strings;
    }

    private JsonNode tryReadTree(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(text);
        } catch (JsonProcessingException ignored) {
            return null;
        }
    }

    private String cleanModelText(String text) {
        if (text == null) {
            return "";
        }
        String cleaned = text.trim();
        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.substring(7).trim();
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.substring(3).trim();
        }
        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3).trim();
        }
        return cleaned;
    }

    private String extractFirstJsonObject(String text) {
        if (text == null) {
            return null;
        }
        int start = text.indexOf('{');
        if (start < 0) {
            return null;
        }
        boolean inString = false;
        boolean escaped = false;
        int depth = 0;
        for (int i = start; i < text.length(); i++) {
            char current = text.charAt(i);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (current == '\\') {
                escaped = true;
                continue;
            }
            if (current == '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (current == '{') {
                depth++;
            } else if (current == '}') {
                depth--;
                if (depth == 0) {
                    return text.substring(start, i + 1);
                }
            }
        }
        return null;
    }

    private void addSignal(Map<String, Map<String, Object>> keywordMap,
                           Set<String> threats,
                           String word,
                           int confidence,
                           String type) {
        String key = word.toLowerCase(Locale.ROOT);
        Map<String, Object> existing = keywordMap.get(key);
        if (existing == null) {
            keywordMap.put(key, keyword(word, confidence, type));
        } else {
            int existingConfidence = toInt(existing.get("confidence")).orElse(0);
            existing.put("confidence", Math.max(existingConfidence, confidence));
        }
        threats.add(word);
    }

    private Map<String, Object> keyword(String word, int confidence, String type) {
        Map<String, Object> keyword = new LinkedHashMap<>();
        keyword.put("word", word == null || word.isBlank() ? "Suspicious indicator" : word.trim());
        keyword.put("confidence", clamp(confidence, 0, 100));
        keyword.put("type", type == null || type.isBlank() ? "threat" : type.trim());
        return keyword;
    }

    private List<String> extractUrls(String text) {
        List<String> urls = new ArrayList<>();
        Matcher matcher = URL_PATTERN.matcher(text == null ? "" : text);
        while (matcher.find()) {
            String url = matcher.group(1);
            if (url != null) {
                urls.add(url.replaceAll("[),.;!?]+$", ""));
            }
        }
        return dedupeStrings(urls);
    }

    private boolean isSuspiciousUrl(String url, String fullMessageLower) {
        String domain = extractDomain(url);
        if (domain.isBlank()) {
            return true;
        }
        boolean trusted = isTrustedDomain(domain);
        boolean shortener = SHORTENER_DOMAINS.contains(domain);
        boolean riskyDomainWords = matches(domain, "(bank|login|verify|kyc|secure|account|support|wallet|reward|bonus|apk)");
        boolean riskyMessageWords = matches(fullMessageLower,
                "\\b(bank|account|kyc|blocked|verify|login|otp|payment|claim|prize|apk|install|password|cvv|pin)\\b");
        boolean insecure = url.toLowerCase(Locale.ROOT).startsWith("http://");
        boolean ipAddress = matches(domain, "^\\d{1,3}(?:\\.\\d{1,3}){3}$");

        if (trusted && !riskyMessageWords && !shortener && !insecure) {
            return false;
        }
        return !trusted || shortener || riskyDomainWords || riskyMessageWords || insecure || ipAddress;
    }

    private String extractDomain(String url) {
        if (url == null || url.isBlank()) {
            return "";
        }
        String cleaned = url.trim().toLowerCase(Locale.ROOT);
        cleaned = cleaned.replaceFirst("^https?://", "");
        cleaned = cleaned.replaceFirst("^www\\.", "");
        int slash = cleaned.indexOf('/');
        if (slash >= 0) {
            cleaned = cleaned.substring(0, slash);
        }
        int port = cleaned.indexOf(':');
        if (port >= 0) {
            cleaned = cleaned.substring(0, port);
        }
        return cleaned.replaceAll("[^a-z0-9.-]", "");
    }

    private boolean isTrustedDomain(String domain) {
        if (domain == null || domain.isBlank()) {
            return false;
        }
        return TRUSTED_DOMAINS.stream()
                .anyMatch(trusted -> domain.equals(trusted) || domain.endsWith("." + trusted));
    }

    private boolean matches(String text, String regex) {
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(text == null ? "" : text).find();
    }

    private String buildRuleExplanation(String prefix, boolean isThreat, List<String> threats) {
        if (isThreat && !threats.isEmpty()) {
            return prefix + " Detected " + String.join(", ", threats) + ".";
        }
        if (isThreat) {
            return prefix + " Suspicious scam indicators were detected.";
        }
        return prefix + " No phishing patterns, suspicious URLs, urgency tactics, credential theft, APK download requests, or financial fraud indicators were found.";
    }

    private String appendSentence(String text, String sentence) {
        String base = text == null ? "" : text.trim();
        if (base.isBlank()) {
            return sentence;
        }
        if (!base.endsWith(".")) {
            base += ".";
        }
        return base + " " + sentence;
    }

    private int confidenceForScore(int score) {
        if (score > 80) {
            return 95;
        }
        if (score > 60) {
            return 88;
        }
        if (score > 40) {
            return 78;
        }
        return 60;
    }

    private String inferType(String threat) {
        String lower = threat == null ? "" : threat.toLowerCase(Locale.ROOT);
        if (lower.contains("url") || lower.contains("phishing") || lower.contains("verify")) {
            return "phishing";
        }
        if (lower.contains("bank") || lower.contains("payment") || lower.contains("refund") || lower.contains("kyc")) {
            return "financial";
        }
        if (lower.contains("urgent")) {
            return "urgency";
        }
        if (lower.contains("otp") || lower.contains("credential") || lower.contains("password")) {
            return "credential_theft";
        }
        if (lower.contains("apk") || lower.contains("download")) {
            return "malware";
        }
        if (lower.contains("brand") || lower.contains("impersonation")) {
            return "impersonation";
        }
        return "threat";
    }

    private List<String> dedupeStrings(List<String> values) {
        Set<String> seen = new LinkedHashSet<>();
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) {
                seen.add(value.trim());
            }
        }
        return new ArrayList<>(seen);
    }

    private List<Map<String, Object>> dedupeKeywords(List<Map<String, Object>> keywords) {
        Map<String, Map<String, Object>> deduped = new LinkedHashMap<>();
        for (Map<String, Object> keyword : keywords) {
            String word = Objects.toString(keyword.getOrDefault("word", ""), "").trim();
            if (word.isBlank()) {
                continue;
            }
            String key = word.toLowerCase(Locale.ROOT);
            Map<String, Object> existing = deduped.get(key);
            if (existing == null) {
                Map<String, Object> normalized = new LinkedHashMap<>();
                normalized.put("word", word);
                normalized.put("confidence", clamp(toInt(keyword.get("confidence")).orElse(75), 0, 100));
                normalized.put("type", Objects.toString(keyword.getOrDefault("type", "threat"), "threat"));
                deduped.put(key, normalized);
            } else {
                int existingConfidence = toInt(existing.get("confidence")).orElse(0);
                int newConfidence = toInt(keyword.get("confidence")).orElse(0);
                existing.put("confidence", Math.max(existingConfidence, newConfidence));
            }
        }
        return new ArrayList<>(deduped.values());
    }

    private Optional<Integer> toInt(Object value) {
        if (value == null) {
            return Optional.empty();
        }
        if (value instanceof Number number) {
            return Optional.of(number.intValue());
        }
        String text = Objects.toString(value, "").replace("%", "").trim();
        if (text.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of((int) Math.round(Double.parseDouble(text)));
        } catch (NumberFormatException ignored) {
            return Optional.empty();
        }
    }

    private int scoreFromLevel(String level) {
        String normalized = normalizeLevel(level);
        return switch (normalized) {
            case "CRITICAL" -> 85;
            case "HIGH" -> 65;
            case "MEDIUM" -> 45;
            case "LOW" -> 25;
            default -> 0;
        };
    }

    private String levelFromScore(int score) {
        if (score >= 81) {
            return "CRITICAL";
        }
        if (score >= 61) {
            return "HIGH";
        }
        if (score >= 41) {
            return "MEDIUM";
        }
        if (score >= 21) {
            return "LOW";
        }
        return "NONE";
    }

    private String normalizeLevel(String level) {
        String normalized = level == null ? "" : level.trim().toUpperCase(Locale.ROOT);
        if (normalized.contains("CRITICAL")) {
            return "CRITICAL";
        }
        if (normalized.contains("HIGH")) {
            return "HIGH";
        }
        if (normalized.contains("MEDIUM") || normalized.contains("MODERATE")) {
            return "MEDIUM";
        }
        if (normalized.contains("LOW")) {
            return "LOW";
        }
        return "NONE";
    }

    private String normalizeKey(String key) {
        return key == null ? "" : key.replaceAll("[_\\-\\s]", "").toLowerCase(Locale.ROOT);
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private boolean isRetryableStatus(int status) {
        return status == 408 || status == 425 || status == 429 || status >= 500;
    }

    private void sleepBeforeRetry(int attempt) {
        try {
            Thread.sleep(350L * attempt);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private String preview(String body) {
        if (body == null) {
            return "<null>";
        }
        String compact = body.replaceAll("\\s+", " ").trim();
        if (compact.length() <= LOG_PREVIEW_LENGTH) {
            return compact;
        }
        return compact.substring(0, LOG_PREVIEW_LENGTH) + "...";
    }
}
