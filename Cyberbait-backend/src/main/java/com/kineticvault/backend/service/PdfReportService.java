package com.kineticvault.backend.service;

import com.kineticvault.backend.model.Message;
import com.kineticvault.backend.model.Report;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;

/**
 * Service for generating PDF threat reports.
 */
@Service
public class PdfReportService {

    private static final DeviceRgb DARK_BG = new DeviceRgb(26, 29, 36);
    private static final DeviceRgb NEON_GREEN = new DeviceRgb(0, 255, 0);
    private static final DeviceRgb DANGER_RED = new DeviceRgb(255, 59, 48);

    @SuppressWarnings("unchecked")
    public byte[] generatePdf(Report report, Message message) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        try {
            PdfWriter writer = new PdfWriter(baos);
            PdfDocument pdfDoc = new PdfDocument(writer);
            Document document = new Document(pdfDoc);

            // Title
            document.add(new Paragraph("CyberBait: CyberBait An AI-Based Scam Conversation")
                    .setFontSize(24)
                    .setBold()
                    .setTextAlignment(TextAlignment.CENTER)
                    .setFontColor(new DeviceRgb(0, 200, 0)));

            document.add(new Paragraph("Threat Analysis Report")
                    .setFontSize(16)
                    .setTextAlignment(TextAlignment.CENTER)
                    .setFontColor(ColorConstants.DARK_GRAY));

            document.add(new Paragraph("Report ID: " + report.getReportId())
                    .setFontSize(10)
                    .setTextAlignment(TextAlignment.CENTER)
                    .setFontColor(ColorConstants.GRAY));

            document.add(new Paragraph("\n"));

            // Summary Table
            Table summaryTable = new Table(UnitValue.createPercentArray(new float[]{1, 2}));
            summaryTable.setWidth(UnitValue.createPercentValue(100));

            addTableRow(summaryTable, "Risk Score", String.valueOf(message.getRiskScore()) + "/100");
            addTableRow(summaryTable, "Threat Level", message.getThreatLevel());
            addTableRow(summaryTable, "Analyzed At", message.getCreatedAt().toString());
            addTableRow(summaryTable, "Report Generated", report.getCreatedAt().toString());

            document.add(summaryTable);
            document.add(new Paragraph("\n"));

            // Explanation
            document.add(new Paragraph("AI Analysis")
                    .setFontSize(14)
                    .setBold());

            document.add(new Paragraph(message.getExplanation())
                    .setFontSize(11)
                    .setFontColor(ColorConstants.DARK_GRAY));

            document.add(new Paragraph("\n"));

            // Keywords
            if (message.getKeywords() != null && !message.getKeywords().isEmpty()) {
                document.add(new Paragraph("Detected Keywords")
                        .setFontSize(14)
                        .setBold());

                Table keywordTable = new Table(UnitValue.createPercentArray(new float[]{2, 1, 2}));
                keywordTable.setWidth(UnitValue.createPercentValue(100));

                keywordTable.addHeaderCell(new Cell().add(new Paragraph("Word").setBold()));
                keywordTable.addHeaderCell(new Cell().add(new Paragraph("Confidence").setBold()));
                keywordTable.addHeaderCell(new Cell().add(new Paragraph("Type").setBold()));

                for (Map<String, Object> keyword : message.getKeywords()) {
                    keywordTable.addCell(new Cell().add(new Paragraph(String.valueOf(keyword.getOrDefault("word", "")))));
                    keywordTable.addCell(new Cell().add(new Paragraph(String.valueOf(keyword.getOrDefault("confidence", "0")) + "%")));
                    keywordTable.addCell(new Cell().add(new Paragraph(String.valueOf(keyword.getOrDefault("type", "")))));
                }

                document.add(keywordTable);
            }

            document.add(new Paragraph("\n"));

            // Entities
            if (message.getEntities() != null) {
                document.add(new Paragraph("Extracted Entities")
                        .setFontSize(14)
                        .setBold());

                Map<String, Object> entities = message.getEntities();
                List<String> urls = (List<String>) entities.getOrDefault("urls", List.of());
                List<String> phones = (List<String>) entities.getOrDefault("phoneNumbers", List.of());
                List<String> upis = (List<String>) entities.getOrDefault("upiIds", List.of());

                if (!urls.isEmpty()) {
                    document.add(new Paragraph("URLs: " + String.join(", ", urls)).setFontSize(10));
                }
                if (!phones.isEmpty()) {
                    document.add(new Paragraph("Phone Numbers: " + String.join(", ", phones)).setFontSize(10));
                }
                if (!upis.isEmpty()) {
                    document.add(new Paragraph("UPI IDs: " + String.join(", ", upis)).setFontSize(10));
                }
                if (urls.isEmpty() && phones.isEmpty() && upis.isEmpty()) {
                    document.add(new Paragraph("No suspicious entities detected.").setFontSize(10).setFontColor(ColorConstants.GRAY));
                }
            }

            // Footer
            document.add(new Paragraph("\n\n"));
            document.add(new Paragraph("Generated by CyberBait: CyberBait An AI-Based Scam Conversation — AI-Powered Cybersecurity")
                    .setFontSize(8)
                    .setTextAlignment(TextAlignment.CENTER)
                    .setFontColor(ColorConstants.GRAY));

            document.close();

        } catch (Exception e) {
            throw new RuntimeException("Failed to generate PDF report", e);
        }

        return baos.toByteArray();
    }

    private void addTableRow(Table table, String label, String value) {
        table.addCell(new Cell().add(new Paragraph(label).setBold().setFontSize(11)));
        table.addCell(new Cell().add(new Paragraph(value).setFontSize(11)));
    }
}
