package com.kineticvaultapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Required receiver for Android's Default SMS app role. When the user grants that
 * role, SMS_DELIVER is sent only to this app, so we route messages through the
 * same analysis event path used by the normal SMS_RECEIVED receiver.
 */
class DefaultSmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        val appContext = context?.applicationContext ?: run {
            Log.w(TAG, "Default SMS delivery received without a valid context")
            return
        }

        Log.d(TAG, "Default SMS delivery action=${intent?.action}")
        if (intent?.action != Telephony.Sms.Intents.SMS_DELIVER_ACTION) return

        if (!SmsModule.shouldCaptureIncomingSms(appContext)) {
            Log.d(TAG, "Auto-scan is disabled; default SMS delivery ignored")
            return
        }

        val messages = try {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (error: Exception) {
            Log.e(TAG, "Failed to extract default SMS delivery", error)
            return
        }
        if (messages.isNullOrEmpty()) return

        val grouped = mutableMapOf<String, StringBuilder>()
        for (sms in messages) {
            val sender = sms.displayOriginatingAddress
                ?: sms.originatingAddress
                ?: "Unknown"
            grouped.getOrPut(sender) { StringBuilder() }.append(sms.messageBody ?: "")
        }

        for ((sender, body) in grouped) {
            val fullMessage = body.toString().trim()
            if (fullMessage.isNotEmpty()) {
                Log.d(TAG, "Captured default SMS from $sender (${fullMessage.length} chars)")
                SmsModule.emitSmsEvent(
                    appContext,
                    sender,
                    fullMessage,
                    SmsModule.SOURCE_DEFAULT_SMS_RECEIVER
                )
            }
        }
    }

    companion object {
        private const val TAG = "DefaultSmsReceiver"
    }
}
