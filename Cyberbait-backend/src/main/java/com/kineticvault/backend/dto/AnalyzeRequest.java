package com.kineticvault.backend.dto;

import jakarta.validation.constraints.NotBlank;

public class AnalyzeRequest {

    @NotBlank(message = "Message content is required")
    private String message;

    public AnalyzeRequest() {}

    public AnalyzeRequest(String message) {
        this.message = message;
    }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
