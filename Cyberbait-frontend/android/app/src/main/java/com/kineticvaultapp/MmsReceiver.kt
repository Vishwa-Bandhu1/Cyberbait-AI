package com.kineticvaultapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Required receiver for Default SMS app qualification. The app does not analyze
 * MMS content today, but Android expects an MMS delivery endpoint before it can
 * offer the Default SMS role.
 */
class MmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == Telephony.Sms.Intents.WAP_PUSH_DELIVER_ACTION) {
            Log.d(TAG, "MMS delivery received; MMS analysis is not enabled")
        }
    }

    companion object {
        private const val TAG = "MmsReceiver"
    }
}
