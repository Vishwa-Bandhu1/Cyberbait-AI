package com.kineticvault.backend.service;

import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;

/**
 * Service for extracting text from images using Tesseract OCR.
 */
@Service
public class OcrService {

    private final String tessDataPath;

    public OcrService(@Value("${tesseract.data.path:tessdata}") String tessDataPath) {
        this.tessDataPath = tessDataPath;
    }

    /**
     * Extract text from an uploaded image file.
     */
    public String extractText(MultipartFile file) throws IOException, TesseractException {
        BufferedImage image = ImageIO.read(file.getInputStream());

        if (image == null) {
            throw new IOException("Unable to read image file. The file may be corrupted or in an unsupported format.");
        }

        Tesseract tesseract = new Tesseract();
        tesseract.setDatapath(tessDataPath);
        tesseract.setLanguage("eng");

        // Configure for better accuracy
        tesseract.setPageSegMode(3); // Fully automatic page segmentation
        tesseract.setOcrEngineMode(1); // LSTM only

        String extractedText = tesseract.doOCR(image);

        if (extractedText == null || extractedText.trim().isEmpty()) {
            throw new TesseractException("No text could be extracted from the image.");
        }

        return extractedText.trim();
    }
}
