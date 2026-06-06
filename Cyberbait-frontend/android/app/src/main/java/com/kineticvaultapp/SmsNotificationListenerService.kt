package com.kineticvaultapp

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Fallback capture path for OEM builds, especially Realme UI/ColorOS, that may
 * delay or suppress SMS_RECEIVED broadcasts under aggressive background rules.
 *
 * This service only processes notifications from known SMS packages, then
 * forwards extracted sender/body data through the same SmsModule event path as
 * SmsReceiver.
 */
class SmsNotificationListenerService : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.d(TAG, "Notification listener connected")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "Notification listener disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val notification = sbn?.notification ?: return
        val packageName = sbn.packageName ?: return
        val appContext = applicationContext

        if (!SmsModule.shouldCaptureIncomingSms(appContext)) return
        if (!isLikelySmsPackage(packageName, notification)) return

        val extracted = extractNotificationSms(sbn, notification) ?: run {
            Log.d(TAG, "SMS-like notification had no extractable text: package=$packageName")
            return
        }

        Log.d(
            TAG,
            "Captured SMS notification from ${extracted.sender} " +
                "(${extracted.message.length} chars, package=$packageName)"
        )

        SmsModule.emitSmsEvent(
            appContext,
            extracted.sender,
            extracted.message,
            SmsModule.SOURCE_NOTIFICATION_LISTENER
        )
    }

    private fun isLikelySmsPackage(
        packageName: String,
        notification: Notification
    ): Boolean {
        if (packageName == applicationContext.packageName) return false
        if (KNOWN_SMS_PACKAGES.contains(packageName)) return true

        val lowerPackage = packageName.lowercase()
        val packageLooksLikeSms =
            lowerPackage.contains("mms") ||
                lowerPackage.contains("sms") ||
                lowerPackage.contains("messaging")

        return packageLooksLikeSms && notification.category == Notification.CATEGORY_MESSAGE
    }

    private fun extractNotificationSms(
        sbn: StatusBarNotification,
        notification: Notification
    ): ExtractedSms? {
        val extras = notification.extras ?: return null
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)
            ?.toString()
            ?.trim()
            .orEmpty()
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)
            ?.toString()
            ?.trim()
            .orEmpty()

        val messageParts = linkedSetOf<String>()
        listOf(
            Notification.EXTRA_BIG_TEXT,
            Notification.EXTRA_TEXT,
            Notification.EXTRA_SUMMARY_TEXT
        ).forEach { key ->
            extras.getCharSequence(key)
                ?.toString()
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?.let { messageParts.add(it) }
        }

        extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            ?.mapNotNull { it?.toString()?.trim() }
            ?.filter { it.isNotBlank() }
            ?.forEach { messageParts.add(it) }

        val rawMessage = messageParts
            .filterNot { it == title || it == subText }
            .joinToString(separator = "\n")
            .trim()

        if (rawMessage.isBlank()) return null

        val senderFallback = listOf(title, subText, sbn.packageName)
            .firstOrNull { it.isNotBlank() }
            ?: "Unknown"

        return parseSenderAndMessage(senderFallback, rawMessage)
    }

    private fun parseSenderAndMessage(senderFallback: String, rawMessage: String): ExtractedSms {
        val genericTitles = setOf(
            "message",
            "messages",
            "sms",
            "new message",
            "new messages"
        )
        val fallbackIsGeneric = genericTitles.contains(senderFallback.lowercase())
        val firstLine = rawMessage.lineSequence().firstOrNull().orEmpty()
        val separatorIndex = firstLine.indexOf(": ")

        if (fallbackIsGeneric && separatorIndex in 1..60) {
            val parsedSender = firstLine.substring(0, separatorIndex).trim()
            val parsedMessage = firstLine.substring(separatorIndex + 2).trim()
            if (parsedSender.isNotBlank() && parsedMessage.isNotBlank()) {
                val remaining = rawMessage
                    .lineSequence()
                    .drop(1)
                    .joinToString(separator = "\n")
                    .trim()
                val fullMessage = listOf(parsedMessage, remaining)
                    .filter { it.isNotBlank() }
                    .joinToString(separator = "\n")

                return ExtractedSms(parsedSender, fullMessage)
            }
        }

        return ExtractedSms(senderFallback, rawMessage)
    }

    companion object {
        private const val TAG = "SmsNotification"

        private val KNOWN_SMS_PACKAGES = setOf(
            "com.google.android.apps.messaging",
            "com.android.mms",
            "com.android.messaging",
            "com.samsung.android.messaging",
            "com.coloros.mms",
            "com.oplus.mms",
            "com.realme.mms",
            "com.heytap.mms",
            "com.oneplus.mms",
            "com.miui.mms",
            "com.bbk.mms"
        )
    }
}

private data class ExtractedSms(
    val sender: String,
    val message: String
)
