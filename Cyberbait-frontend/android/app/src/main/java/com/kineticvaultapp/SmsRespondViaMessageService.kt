package com.kineticvaultapp

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * Required service for Default SMS app qualification. It provides the manifest
 * endpoint Android checks for "respond via SMS" without changing app UI.
 */
class SmsRespondViaMessageService : Service() {
    override fun onBind(intent: Intent?): IBinder? {
        Log.d(TAG, "Respond-via-message bind requested")
        return null
    }

    companion object {
        private const val TAG = "SmsRespondService"
    }
}
