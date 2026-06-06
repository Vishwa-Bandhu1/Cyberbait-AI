package com.kineticvault.backend.config;

import com.kineticvault.backend.util.SensitiveValueSanitizer;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.mongodb.verify-on-startup", havingValue = "true", matchIfMissing = true)
public class MongoConnectionVerifier implements ApplicationRunner {

    private static final Logger logger = LoggerFactory.getLogger(MongoConnectionVerifier.class);

    private final MongoTemplate mongoTemplate;

    public MongoConnectionVerifier(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            mongoTemplate.executeCommand(new Document("ping", 1));
            logger.info("MongoDB connection check succeeded.");
        } catch (Exception e) {
            logger.error("MongoDB connection check failed during startup ({}): {}",
                    e.getClass().getSimpleName(), SensitiveValueSanitizer.sanitize(e.getMessage()));
            throw new IllegalStateException(
                    "MongoDB connection check failed. Verify MONGODB_URI and MongoDB Atlas network access.");
        }
    }
}
