package com.kineticvaultapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * BroadcastReceiver that listens for incoming SMS messages.
 * Extracts the message body and sender, then forwards them
 * to SmsModule for bridging into React Native.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        val appContext = context?.applicationContext ?: run {
            Log.w(TAG, "SMS broadcast received without a valid context")
            return
        }

        Log.d(TAG, "Broadcast received: action=${intent?.action}")

        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        if (!SmsModule.shouldCaptureIncomingSms(appContext)) {
            Log.d(TAG, "Auto-scan is disabled; incoming SMS ignored")
            return
        }

        val messages = try {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (error: Exception) {
            Log.e(TAG, "Failed to extract SMS messages from broadcast intent", error)
            return
        }
        if (messages.isNullOrEmpty()) return

        // Group multi-part SMS by sender and concatenate bodies
        val grouped = mutableMapOf<String, StringBuilder>()
        for (sms in messages) {
            val sender = sms.displayOriginatingAddress
                ?: sms.originatingAddress
                ?: "Unknown"
            grouped.getOrPut(sender) { StringBuilder() }.append(sms.messageBody ?: "")
        }

        // Forward each complete message to the React Native bridge
        for ((sender, body) in grouped) {
            val fullMessage = body.toString().trim()
            if (fullMessage.isNotEmpty()) {
                Log.d(TAG, "Extracted SMS from $sender (${fullMessage.length} chars)")
                SmsModule.emitSmsEvent(
                    appContext,
                    sender,
                    fullMessage,
                    SmsModule.SOURCE_BROADCAST_RECEIVER
                )
            }
        }
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
