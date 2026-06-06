package com.kineticvaultapp

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

/**
 * Required SENDTO endpoint for Default SMS app qualification. Deep links into
 * SMS composition open the existing React Native app instead of adding UI here.
 */
class SmsComposeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "SMS compose intent received: action=${intent?.action} data=${intent?.data}")

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(this, MainActivity::class.java)
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        startActivity(launchIntent)
        finish()
    }

    companion object {
        private const val TAG = "SmsComposeActivity"
    }
}
