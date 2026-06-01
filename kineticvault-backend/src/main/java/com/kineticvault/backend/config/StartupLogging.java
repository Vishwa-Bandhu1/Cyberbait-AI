package com.kineticvault.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class StartupLogging {

    private static final Logger logger = LoggerFactory.getLogger(StartupLogging.class);

    private final Environment environment;

    public StartupLogging(Environment environment) {
        this.environment = environment;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logApplicationReady() {
        String applicationName = environment.getProperty("spring.application.name", "kineticvault-backend");
        String port = environment.getProperty("local.server.port",
                environment.getProperty("server.port", "unknown"));
        logger.info("{} started successfully and is listening on port {}.", applicationName, port);
    }
}
