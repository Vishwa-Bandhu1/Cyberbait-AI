package com.kineticvault.backend.controller;

import com.kineticvault.backend.dto.AnalyzeRequest;
import com.kineticvault.backend.dto.AnalyzeResponse;
import com.kineticvault.backend.dto.ErrorResponse;
import com.kineticvault.backend.model.Message;
import com.kineticvault.backend.service.AnalysisService;
import com.kineticvault.backend.service.OcrService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api")
public class AnalyzeController {

    private final AnalysisService analysisService;
    private final OcrService ocrService;

    public AnalyzeController(AnalysisService analysisService, OcrService ocrService) {
        this.analysisService = analysisService;
        this.ocrService = ocrService;
    }

    /**
     * POST /api/analyze
     * Analyzes a text message for scam/phishing indicators.
     */
    @PostMapping("/analyze")
    public ResponseEntity<AnalyzeResponse> analyzeMessage(@Valid @RequestBody AnalyzeRequest request) {
        AnalyzeResponse response = analysisService.analyzeMessage(request.getMessage());
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/analyze-image
     * Accepts an image, extracts text via OCR, then analyzes it.
     */
    @PostMapping("/analyze-image")
    public ResponseEntity<?> analyzeImage(@RequestParam("image") MultipartFile image) {
        try {
            if (image.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new ErrorResponse("INVALID_FILE", "No image file provided"));
            }

            // Extract text from image
            String extractedText = ocrService.extractText(image);

            // Analyze the extracted text
            AnalyzeResponse response = analysisService.analyzeMessage(extractedText);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(new ErrorResponse("OCR_FAILED", "Unable to extract text from image: " + e.getMessage()));
        }
    }

    /**
     * GET /api/history
     * Returns all previous scans ordered by most recent.
     */
    @GetMapping("/history")
    public ResponseEntity<List<Message>> getHistory() {
        List<Message> history = analysisService.getHistory();
        return ResponseEntity.ok(history);
    }
}
