package com.kineticvault.backend.dto;

public class ReportRequest {

    private String messageId;

    public ReportRequest() {}

    public ReportRequest(String messageId) {
        this.messageId = messageId;
    }

    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }
}
