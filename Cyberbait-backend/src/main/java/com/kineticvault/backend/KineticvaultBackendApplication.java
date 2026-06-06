package com.kineticvault.backend;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.data.mongodb.core.MongoTemplate;

import java.io.File;
import java.util.Arrays;

@SpringBootApplication
public class KineticvaultBackendApplication {

	private static final Logger logger = LoggerFactory.getLogger(KineticvaultBackendApplication.class);

	public static void main(String[] args) {
		SpringApplication.run(KineticvaultBackendApplication.class, args);
	}

	@Bean
	public CommandLineRunner startupDiagnostics(Environment env, MongoTemplate mongoTemplate) {
		return args -> {
			logger.info("================ STARTUP DIAGNOSTICS ================");
			
			// 1. Application started & Active profile
			String[] activeProfiles = env.getActiveProfiles();
			logger.info("Application started successfully.");
			logger.info("Active Profile(s): {}", activeProfiles.length > 0 ? Arrays.toString(activeProfiles) : "default");

			// 2. MongoDB connection
			try {
				mongoTemplate.executeCommand("{ ping: 1 }");
				logger.info("MongoDB Connection: SUCCESS");
			} catch (Exception e) {
				logger.error("MongoDB Connection: FAILED - {}", e.getMessage());
			}

			// 3. Tesseract Detection
			String tessPath = env.getProperty("tesseract.data.path", "/usr/share/tesseract-ocr/5/tessdata");
			File tessDir = new File(tessPath);
			if (tessDir.exists() && tessDir.isDirectory()) {
				logger.info("Tesseract Configuration: DETECTED at {}", tessPath);
			} else {
				logger.warn("Tesseract Configuration: NOT FOUND at {}. OCR features may fail.", tessPath);
			}
			
			logger.info("=====================================================");
		};
	}
}