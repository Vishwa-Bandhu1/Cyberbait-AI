package com.kineticvaultapp

import android.telecom.Call
import android.telecom.CallScreeningService

/**
 * A minimal CallScreeningService required by Android 10+ to request ROLE_CALL_SCREENING.
 * Having this role allows the app to insert numbers into BlockedNumberContract without
 * needing to be the default SMS app. We don't actually screen calls here, we just need
 * the role.
 */
class CyberBaitCallScreeningService : CallScreeningService() {
    override fun onScreenCall(callDetails: Call.Details) {
        // We do not screen calls, simply allow everything.
        val response = CallResponse.Builder()
            .setDisallowCall(false)
            .setRejectCall(false)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .build()
        respondToCall(callDetails, response)
    }
}
