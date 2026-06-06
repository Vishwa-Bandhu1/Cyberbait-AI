package com.kineticvault.backend.util;

import java.util.regex.Pattern;

public final class SensitiveValueSanitizer {

    private static final Pattern URI_CREDENTIALS = Pattern.compile(
            "([a-z][a-z0-9+.-]*://)([^\\s/@:]+):([^\\s/@]+)@",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern BEARER_TOKEN = Pattern.compile(
            "(?i)\\bBearer\\s+[A-Za-z0-9._~+\\-/=]+"
    );
    private static final Pattern NAMED_SECRET = Pattern.compile(
            "(?i)\\b(password|passwd|pwd|secret|token|api[_-]?key|authorization)\\s*[:=]\\s*([^,\\s}]+)"
    );
    private static final Pattern SECRET_QUERY_PARAMETER = Pattern.compile(
            "(?i)([?&](?:password|passwd|pwd|secret|token|api[_-]?key|authorization)=)([^&#\\s]+)"
    );

    private SensitiveValueSanitizer() {
    }

    public static String sanitize(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }

        String sanitized = URI_CREDENTIALS.matcher(value)
                .replaceAll("$1<redacted>:<redacted>@");
        sanitized = BEARER_TOKEN.matcher(sanitized)
                .replaceAll("Bearer <redacted>");
        sanitized = NAMED_SECRET.matcher(sanitized)
                .replaceAll("$1=<redacted>");
        return SECRET_QUERY_PARAMETER.matcher(sanitized)
                .replaceAll("$1<redacted>");
    }
}
