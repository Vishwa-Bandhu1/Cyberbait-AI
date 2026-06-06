package com.kineticvault.backend.controller;

import com.kineticvault.backend.dto.ErrorResponse;
import com.kineticvault.backend.dto.ReportRequest;
import com.kineticvault.backend.model.Message;
import com.kineticvault.backend.model.Report;
import com.kineticvault.backend.repository.MessageRepository;
import com.kineticvault.backend.service.AnalysisService;
import com.kineticvault.backend.service.PdfReportService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ReportController {

    private final AnalysisService analysisService;
    private final PdfReportService pdfReportService;
    private final MessageRepository messageRepository;

    public ReportController(AnalysisService analysisService,
                            PdfReportService pdfReportService,
                            MessageRepository messageRepository) {
        this.analysisService = analysisService;
        this.pdfReportService = pdfReportService;
        this.messageRepository = messageRepository;
    }

    /**
     * POST /api/report
     * Generates a structured report (JSON) for a given messageId.
     */
    @PostMapping("/report")
    public ResponseEntity<?> generateReport(@RequestBody ReportRequest request) {
        try {
            Report report = analysisService.generateReport(request.getMessageId());
            return ResponseEntity.ok(report);
        } catch (RuntimeException e) {
            return ResponseEntity.status(404)
                    .body(new ErrorResponse("NOT_FOUND", e.getMessage()));
        }
    }

    /**
     * GET /api/report/pdf/{messageId}
     * Generates and streams a PDF report for download.
     */
    @GetMapping("/report/pdf/{messageId}")
    public ResponseEntity<?> downloadPdfReport(@PathVariable String messageId) {
        try {
            Report report = analysisService.generateReport(messageId);
            Message message = messageRepository.findById(messageId)
                    .orElseThrow(() -> new RuntimeException("Message not found"));

            byte[] pdfBytes = pdfReportService.generatePdf(report, message);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDisposition(ContentDisposition.builder("attachment")
                    .filename("Cyberbait_Report_" + report.getReportId() + ".pdf")
                    .build());

            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);

        } catch (RuntimeException e) {
            return ResponseEntity.status(404)
                    .body(new ErrorResponse("NOT_FOUND", e.getMessage()));
        }
    }
}
