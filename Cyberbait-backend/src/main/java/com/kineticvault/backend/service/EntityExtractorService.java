package com.kineticvault.backend.service;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Service for extracting entities (URLs, phone numbers, UPI IDs) from text
 * using rule-based regex patterns.
 */
@Service
public class EntityExtractorService {

    // URL pattern
    private static final Pattern URL_PATTERN = Pattern.compile(
            "(https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+)" +
            "|" +
            "(www\\.[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+)",
            Pattern.CASE_INSENSITIVE
    );

    // Phone number pattern (international and Indian formats)
    private static final Pattern PHONE_PATTERN = Pattern.compile(
            "(\\+?\\d{1,3}[-.\\s]?)?(\\(?\\d{2,4}\\)?[-.\\s]?)?\\d{3,4}[-.\\s]?\\d{4}"
    );

    // UPI ID pattern
    private static final Pattern UPI_PATTERN = Pattern.compile(
            "[a-zA-Z0-9.\\-_]+@[a-zA-Z]{2,}"
    );

    /**
     * Extracts all entities from the given text.
     */
    public Map<String, Object> extractEntities(String text) {
        Map<String, Object> entities = new HashMap<>();
        entities.put("urls", extractUrls(text));
        entities.put("phoneNumbers", extractPhoneNumbers(text));
        entities.put("upiIds", extractUpiIds(text));
        return entities;
    }

    private List<String> extractUrls(String text) {
        List<String> urls = new ArrayList<>();
        Matcher matcher = URL_PATTERN.matcher(text);
        while (matcher.find()) {
            urls.add(matcher.group().trim());
        }
        return urls;
    }

    private List<String> extractPhoneNumbers(String text) {
        List<String> phones = new ArrayList<>();
        Matcher matcher = PHONE_PATTERN.matcher(text);
        while (matcher.find()) {
            String phone = matcher.group().trim();
            // Filter out short numeric strings that aren't phone numbers
            if (phone.replaceAll("[^\\d]", "").length() >= 10) {
                phones.add(phone);
            }
        }
        return phones;
    }

    private List<String> extractUpiIds(String text) {
        List<String> upiIds = new ArrayList<>();
        Matcher matcher = UPI_PATTERN.matcher(text);
        while (matcher.find()) {
            String candidate = matcher.group().trim();
            // Basic UPI validation: must contain @, should not be a regular email
            if (candidate.contains("@") && !candidate.contains(".com") &&
                !candidate.contains(".org") && !candidate.contains(".net")) {
                upiIds.add(candidate);
            }
        }
        return upiIds;
    }
}
