package com.kineticvault.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

public class AnalyzeResponse {

    private String id;
    private boolean isThreat;
    private int riskScore;
    private String threatLevel;
    private List<String> threats;
    private List<Map<String, Object>> keywords;
    private Map<String, Object> entities;
    private String explanation;
    private String createdAt;

    public AnalyzeResponse() {}

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    @JsonProperty("isThreat")
    public boolean isThreat() { return isThreat; }
    @JsonProperty("isThreat")
    public void setThreat(boolean threat) { isThreat = threat; }

    public int getRiskScore() { return riskScore; }
    public void setRiskScore(int riskScore) { this.riskScore = riskScore; }

    public String getThreatLevel() { return threatLevel; }
    public void setThreatLevel(String threatLevel) { this.threatLevel = threatLevel; }

    public List<String> getThreats() { return threats; }
    public void setThreats(List<String> threats) { this.threats = threats; }

    public List<Map<String, Object>> getKeywords() { return keywords; }
    public void setKeywords(List<Map<String, Object>> keywords) { this.keywords = keywords; }

    public Map<String, Object> getEntities() { return entities; }
    public void setEntities(Map<String, Object> entities) { this.entities = entities; }

    public String getExplanation() { return explanation; }
    public void setExplanation(String explanation) { this.explanation = explanation; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
