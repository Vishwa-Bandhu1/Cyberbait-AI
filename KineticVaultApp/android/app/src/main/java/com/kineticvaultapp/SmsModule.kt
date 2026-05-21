package com.kineticvaultapp

import android.Manifest
import android.app.Activity
import android.app.role.RoleManager
import android.content.ContentValues
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.BlockedNumberContract
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

/**
 * React Native native module that bridges SMS events from Android receivers and
 * services into JavaScript via DeviceEventEmitter.
 */
class SmsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    @Volatile
    private var listenerCount = 0

    private var roleRequestPromise: Promise? = null
    private var roleRequestResponseMode = ROLE_RESPONSE_BOOLEAN
    private var pendingRoleName = ROLE_NAME_UNKNOWN
    private var savedPreviousDefaultSmsPackage: String? = null
    private var pendingBlockSender: String? = null
    private var pendingBlockPromise: Promise? = null

    private val activityEventListener = object : ActivityEventListener {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode == REQUEST_CODE_CALL_SCREENING || requestCode == REQUEST_CODE_DEFAULT_SMS) {
                // Check if this is part of a combined block-with-role flow
                val blockSender = pendingBlockSender
                val blockPromise = pendingBlockPromise
                if (blockSender != null && blockPromise != null) {
                    pendingBlockSender = null
                    pendingBlockPromise = null
                    clearPendingRoleRequest()
                    handlePostRoleBlock(blockSender, blockPromise)
                    return
                }

                val promise = roleRequestPromise ?: return
                val responseMode = roleRequestResponseMode
                val requestedRole = pendingRoleName
                clearPendingRoleRequest()

                val status = buildBlockingCapability()
                Log.d(
                    TAG,
                    "Role request finished: role=$requestedRole resultCode=$resultCode " +
                        "canBlock=${status.canBlockSender} defaultSms=${status.isDefaultSmsApp} " +
                        "callScreening=${status.hasCallScreeningRole}"
                )

                if (responseMode == ROLE_RESPONSE_STATUS) {
                    promise.resolve(
                        status.toWritableMap(
                            event = "role_request_completed",
                            requestedRole = requestedRole,
                            requestResultCode = resultCode
                        )
                    )
                } else {
                    promise.resolve(status.canBlockSender)
                }
            }
        }

        override fun onNewIntent(intent: Intent) {}
    }

    init {
        smsModuleInstance = this
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = MODULE_NAME

    override fun invalidate() {
        if (smsModuleInstance === this) {
            smsModuleInstance = null
        }
        super.invalidate()
    }

    /**
     * Check if SMS permissions are granted.
     * Callable from JavaScript: NativeModules.SmsModule.checkSmsPermission()
     */
    @ReactMethod
    fun checkSmsPermission(promise: Promise) {
        val receiveGranted = ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED
        val readGranted = ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED

        promise.resolve(receiveGranted && readGranted)
    }

    @ReactMethod
    fun setAutoScanEnabled(enabled: Boolean, promise: Promise) {
        setAutoScanEnabled(reactApplicationContext, enabled)
        if (enabled) {
            drainPendingSmsEvents()
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun getAutoScanEnabled(promise: Promise) {
        promise.resolve(isAutoScanEnabled(reactApplicationContext))
    }

    @ReactMethod
    fun getDeviceRestrictionInfo(promise: Promise) {
        val params = Arguments.createMap().apply {
            putString("manufacturer", Build.MANUFACTURER)
            putString("model", Build.MODEL)
            putBoolean("isRealmeFamily", isRealmeFamilyDevice())
            putBoolean("notificationListenerEnabled", isNotificationListenerEnabled())
            putBoolean("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations())
        }

        promise.resolve(params)
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        promise.resolve(isIgnoringBatteryOptimizations())
    }

    @ReactMethod
    fun isNotificationListenerEnabled(promise: Promise) {
        promise.resolve(isNotificationListenerEnabled())
    }

    @ReactMethod
    fun openNotificationListenerSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (error: Exception) {
            Log.e(TAG, "Unable to open notification listener settings", error)
            openAppSettings()
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            promise.resolve(true)
            return
        }

        if (isIgnoringBatteryOptimizations()) {
            promise.resolve(true)
            return
        }

        val packageUri = Uri.parse("package:${reactApplicationContext.packageName}")
        val intents = listOf(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = packageUri
            },
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = packageUri
            }
        )

        promise.resolve(startFirstAvailableActivity(intents, "battery optimization settings"))
    }

    @ReactMethod
    fun openManufacturerAutoStartSettings(promise: Promise) {
        val intents = buildManufacturerSettingsIntents()
        promise.resolve(startFirstAvailableActivity(intents, "manufacturer background settings"))
    }

    /**
     * Required for React Native event emitter listener management.
     */
    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount += 1
        Log.d(TAG, "JS listener added for $eventName; count=$listenerCount")

        if (eventName == EVENT_SMS_RECEIVED) {
            drainPendingSmsEvents()
        }
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount = (listenerCount - count).coerceAtLeast(0)
        Log.d(TAG, "JS listener removed; count=$listenerCount")
    }

    @ReactMethod
    fun getSenderBlockStatus(promise: Promise) {
        val status = buildBlockingCapability()
        logBlockingCapability("Status check", status)
        promise.resolve(status.toWritableMap(event = "status_check"))
    }

    @ReactMethod
    fun requestSenderBlockingRole(promise: Promise) {
        val status = buildBlockingCapability()
        logBlockingCapability("Blocking role request pre-check", status)

        if (status.canBlockSender) {
            promise.resolve(status.toWritableMap(event = "already_granted"))
            return
        }

        if (roleRequestPromise != null) {
            Log.w(TAG, "Role request ignored because another request is already active")
            promise.resolve(
                status.toWritableMap(
                    event = "role_request_in_progress",
                    errorCode = "ROLE_REQUEST_IN_PROGRESS",
                    errorMessage = "Another Android role request is already active."
                )
            )
            return
        }

        // Request ROLE_SMS (Default SMS App) FIRST — this is the only role that
        // grants write access to BlockedNumberContract. ROLE_CALL_SCREENING does NOT.
        Log.d(TAG, "Requesting Default SMS role for sender blocking")
        if (startDefaultSmsRoleRequest(promise, ROLE_RESPONSE_STATUS)) {
            return
        }

        Log.w(TAG, "No supported Android role request path is available for sender blocking")
        promise.resolve(
            status.toWritableMap(
                event = "role_request_unavailable",
                errorCode = "ROLE_REQUEST_UNAVAILABLE",
                errorMessage = "Android did not expose a supported role request screen on this device."
            )
        )
    }

    /**
     * Combined flow: request default SMS role if needed, then block, then offer restore.
     * This is the recommended entry point from JavaScript for the "Block Sender" button.
     */
    @ReactMethod
    fun blockSenderWithRoleFlow(sender: String, promise: Promise) {
        val trimmedSender = sender.trim()
        if (trimmedSender.isBlank()) {
            promise.resolve(blockResult(false, sender, "INVALID_NUMBER", "Sender is invalid."))
            return
        }

        val status = buildBlockingCapability()
        logBlockingCapability("blockSenderWithRoleFlow pre-check", status)

        // Already have permission — block directly
        if (status.canBlockSender) {
            Log.d(TAG, "Already have blocking permission, executing block directly")
            executeBlockInternal(trimmedSender, promise)
            return
        }

        // Need to request Default SMS role first
        if (roleRequestPromise != null || pendingBlockPromise != null) {
            promise.resolve(blockResult(false, trimmedSender, "ROLE_REQUEST_IN_PROGRESS",
                "Another role request is already active. Please wait and try again."))
            return
        }

        // Save current default SMS app so we can offer to restore it later
        savedPreviousDefaultSmsPackage = detectCurrentDefaultSmsPackage()
        Log.d(TAG, "Saved previous default SMS package: $savedPreviousDefaultSmsPackage")

        // Store pending block info so onActivityResult can continue the flow
        pendingBlockSender = trimmedSender
        pendingBlockPromise = promise

        // Launch the Default SMS role request
        val dummyPromise = object : Promise {
            override fun resolve(value: Any?) { /* handled in onActivityResult */ }
            override fun reject(code: String?, message: String?) { pendingBlockSender = null; pendingBlockPromise = null }
            override fun reject(code: String?, throwable: Throwable?) { pendingBlockSender = null; pendingBlockPromise = null }
            override fun reject(code: String?, message: String?, throwable: Throwable?) { pendingBlockSender = null; pendingBlockPromise = null }
            override fun reject(throwable: Throwable) { pendingBlockSender = null; pendingBlockPromise = null }
            override fun reject(message: String) { pendingBlockSender = null; pendingBlockPromise = null }
            @Deprecated("Use reject with code") override fun reject(code: String?, message: String?, userInfo: WritableMap) { pendingBlockSender = null; pendingBlockPromise = null }
            @Deprecated("Use reject with code") override fun reject(throwable: Throwable, userInfo: WritableMap) { pendingBlockSender = null; pendingBlockPromise = null }
            @Deprecated("Use reject with code") override fun reject(code: String?, throwable: Throwable?, userInfo: WritableMap) { pendingBlockSender = null; pendingBlockPromise = null }
            @Deprecated("Use reject with code") override fun reject(code: String?, message: String?, throwable: Throwable?, userInfo: WritableMap?) { pendingBlockSender = null; pendingBlockPromise = null }
            @Deprecated("Use reject with code") override fun reject(code: String?, userInfo: WritableMap) { pendingBlockSender = null; pendingBlockPromise = null }
        }

        val started = startDefaultSmsRoleRequest(dummyPromise, ROLE_RESPONSE_STATUS)
        if (!started) {
            pendingBlockSender = null
            pendingBlockPromise = null
            promise.resolve(blockResult(false, trimmedSender, "ROLE_REQUEST_UNAVAILABLE",
                "Could not open the Default SMS app selection screen on this device.", requiresRole = true, status = status))
        }
    }

    /**
     * Restore the previous default SMS app after blocking is complete.
     */
    @ReactMethod
    fun restorePreviousDefaultSms(promise: Promise) {
        val previousPackage = savedPreviousDefaultSmsPackage
        if (previousPackage.isNullOrBlank()) {
            Log.d(TAG, "No previous default SMS package to restore")
            promise.resolve(Arguments.createMap().apply {
                putBoolean("restored", false)
                putString("reason", "No previous default SMS app was saved.")
            })
            return
        }

        val currentDefault = detectCurrentDefaultSmsPackage()
        if (currentDefault != reactApplicationContext.packageName) {
            Log.d(TAG, "App is no longer default SMS, no restore needed")
            savedPreviousDefaultSmsPackage = null
            promise.resolve(Arguments.createMap().apply {
                putBoolean("restored", true)
                putString("reason", "App is already not the default SMS app.")
            })
            return
        }

        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(Arguments.createMap().apply {
                putBoolean("restored", false)
                putString("reason", "No active screen available.")
            })
            return
        }

        try {
            val intent = Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT).apply {
                putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, previousPackage)
            }
            Log.d(TAG, "Opening restore dialog for previous SMS app: $previousPackage")
            activity.startActivity(intent)
            savedPreviousDefaultSmsPackage = null
            promise.resolve(Arguments.createMap().apply {
                putBoolean("restored", true)
                putString("previousPackage", previousPackage)
            })
        } catch (error: Exception) {
            Log.e(TAG, "Failed to open restore default SMS dialog", error)
            promise.resolve(Arguments.createMap().apply {
                putBoolean("restored", false)
                putString("reason", error.message ?: "Failed to open restore dialog.")
            })
        }
    }

    @ReactMethod
    fun getSavedPreviousDefaultSms(promise: Promise) {
        val currentDefault = detectCurrentDefaultSmsPackage()
        val isAppDefault = currentDefault == reactApplicationContext.packageName
        promise.resolve(Arguments.createMap().apply {
            putString("previousPackage", savedPreviousDefaultSmsPackage)
            putBoolean("isAppCurrentlyDefault", isAppDefault)
            putString("currentDefault", currentDefault)
        })
    }

    @ReactMethod
    fun requestCallScreeningRole(promise: Promise) {
        val status = buildBlockingCapability()
        if (status.hasCallScreeningRole || status.isDefaultSmsApp) {
            promise.resolve(true)
            return
        }

        val started = startRoleRequest(
            roleName = ROLE_NAME_CALL_SCREENING,
            androidRole = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager.ROLE_CALL_SCREENING
            } else {
                null
            },
            requestCode = REQUEST_CODE_CALL_SCREENING,
            promise = promise,
            responseMode = ROLE_RESPONSE_BOOLEAN
        )

        if (!started) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestDefaultSmsRole(promise: Promise) {
        val status = buildBlockingCapability()
        if (status.isDefaultSmsApp) {
            promise.resolve(true)
            return
        }

        val started = startDefaultSmsRoleRequest(promise, ROLE_RESPONSE_BOOLEAN)
        if (!started) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun blockSender(sender: String, promise: Promise) {
        val trimmedSender = sender.trim()
        if (trimmedSender.isBlank()) {
            Log.w(TAG, "Block request rejected: sender is blank")
            promise.resolve(blockResult(false, sender, "INVALID_NUMBER", "Sender number is invalid."))
            return
        }

        val status = buildBlockingCapability()
        logBlockingCapability("Block pre-check", status)

        if (!status.canBlockSender) {
            Log.w(TAG, "Block request needs Default SMS role: sender=$trimmedSender defaultSms=${status.isDefaultSmsApp}")
            promise.resolve(blockResult(
                success = false, sender = trimmedSender, code = "ROLE_REQUIRED",
                message = "Android requires this app to be the Default SMS app before it can block senders.",
                requiresRole = true, status = status
            ))
            return
        }

        executeBlockInternal(trimmedSender, promise)
    }

    private fun handlePostRoleBlock(sender: String, promise: Promise) {
        val status = buildBlockingCapability()
        logBlockingCapability("Post-role-request status", status)

        if (!status.canBlockSender) {
            Log.w(TAG, "User denied Default SMS role, cannot block sender=$sender")
            promise.resolve(blockResult(
                success = false, sender = sender, code = "ROLE_DENIED",
                message = "Default SMS role was not granted. Cannot block sender without this permission.",
                requiresRole = true, status = status
            ))
            return
        }

        Log.d(TAG, "Default SMS role granted, executing block for sender=$sender")
        executeBlockInternal(sender, promise)
    }

    private fun executeBlockInternal(sender: String, promise: Promise) {
        val status = buildBlockingCapability()
        try {
            val contentValues = ContentValues().apply {
                put(BlockedNumberContract.BlockedNumbers.COLUMN_ORIGINAL_NUMBER, sender)
            }
            val insertedUri = reactApplicationContext.contentResolver.insert(
                BlockedNumberContract.BlockedNumbers.CONTENT_URI,
                contentValues
            )

            if (insertedUri == null) {
                Log.w(TAG, "BlockedNumberContract insert returned null for sender=$sender")
                promise.resolve(blockResult(false, sender, "BLOCK_FAILED",
                    "Android did not add this sender to the blocked list.", status = status))
                return
            }

            Log.d(TAG, "Successfully blocked sender=$sender uri=$insertedUri")
            val hasPreviousSms = !savedPreviousDefaultSmsPackage.isNullOrBlank() &&
                savedPreviousDefaultSmsPackage != reactApplicationContext.packageName
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("sender", sender)
                putString("code", "BLOCKED")
                putString("message", "Sender blocked successfully.")
                putBoolean("requiresRole", false)
                putBoolean("canRestorePreviousSms", hasPreviousSms)
                putString("previousSmsPackage", savedPreviousDefaultSmsPackage)
                putMap("status", buildBlockingCapability().toWritableMap(event = "block_result"))
            })
        } catch (error: SecurityException) {
            val freshStatus = buildBlockingCapability()
            Log.e(TAG, "SecurityException blocking sender=$sender; defaultSms=${freshStatus.isDefaultSmsApp}", error)
            promise.resolve(blockResult(false, sender, "PERMISSION_DENIED",
                error.message ?: "App must be the Default SMS app to block senders.",
                requiresRole = true, status = freshStatus))
        } catch (error: Exception) {
            Log.e(TAG, "Failed to block sender=$sender", error)
            promise.resolve(blockResult(false, sender, "BLOCK_FAILED",
                error.message ?: "Android failed to block this sender.", status = buildBlockingCapability()))
        }
    }

    private fun detectCurrentDefaultSmsPackage(): String? {
        val telephonyDefault = getDefaultSmsPackage()
        if (!telephonyDefault.isNullOrBlank()) return telephonyDefault

        // Realme/ColorOS may return null from Telephony API. Try known packages.
        if (isRealmeFamilyDevice()) {
            val knownColorOsSms = listOf(
                "com.coloros.mms", "com.oplus.mms", "com.realme.mms",
                "com.heytap.mms", "com.oneplus.mms"
            )
            val pm = reactApplicationContext.packageManager
            for (pkg in knownColorOsSms) {
                try {
                    pm.getPackageInfo(pkg, 0)
                    Log.d(TAG, "Detected Realme/ColorOS SMS app: $pkg")
                    return pkg
                } catch (_: PackageManager.NameNotFoundException) { }
            }
        }

        // Try Google Messages as last resort
        try {
            reactApplicationContext.packageManager.getPackageInfo("com.google.android.apps.messaging", 0)
            return "com.google.android.apps.messaging"
        } catch (_: PackageManager.NameNotFoundException) { }

        return null
    }

    private fun buildBlockingCapability(): BlockingCapability {
        val defaultSmsPackage = getDefaultSmsPackage()
        val defaultDialerPackage = getDefaultDialerPackage()
        val isDefaultSmsApp = defaultSmsPackage == reactApplicationContext.packageName
        val isDefaultDialer = defaultDialerPackage == reactApplicationContext.packageName
        val hasCallScreeningRole = isAndroidRoleHeld(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager.ROLE_CALL_SCREENING
            } else {
                null
            }
        )
        val isCallScreeningRoleAvailable = isAndroidRoleAvailable(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager.ROLE_CALL_SCREENING
            } else {
                null
            }
        )
        val isSmsRoleAvailable = isAndroidRoleAvailable(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                RoleManager.ROLE_SMS
            } else {
                null
            }
        ) || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
        val canCurrentUserBlockNumbers = try {
            BlockedNumberContract.canCurrentUserBlockNumbers(reactApplicationContext)
        } catch (error: Exception) {
            Log.w(TAG, "Unable to read canCurrentUserBlockNumbers", error)
            false
        }

        // CRITICAL FIX: Only isDefaultSmsApp or isDefaultDialer grants
        // write access to BlockedNumberContract. ROLE_CALL_SCREENING does NOT.
        val canBlock = isDefaultSmsApp || isDefaultDialer

        return BlockingCapability(
            apiLevel = Build.VERSION.SDK_INT,
            manufacturer = Build.MANUFACTURER.orEmpty(),
            brand = Build.BRAND.orEmpty(),
            model = Build.MODEL.orEmpty(),
            isRealmeFamily = isRealmeFamilyDevice(),
            defaultSmsPackage = defaultSmsPackage,
            defaultDialerPackage = defaultDialerPackage,
            isDefaultSmsApp = isDefaultSmsApp,
            hasCallScreeningRole = hasCallScreeningRole,
            isCallScreeningRoleAvailable = isCallScreeningRoleAvailable,
            isSmsRoleAvailable = isSmsRoleAvailable,
            canCurrentUserBlockNumbers = canCurrentUserBlockNumbers,
            canBlockSender = canBlock
        )
    }

    private fun startRoleRequest(
        roleName: String,
        androidRole: String?,
        requestCode: Int,
        promise: Promise,
        responseMode: String
    ): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || androidRole == null) {
            Log.d(TAG, "RoleManager unavailable for role=$roleName api=${Build.VERSION.SDK_INT}")
            return false
        }

        val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as? RoleManager
        if (roleManager == null) {
            Log.w(TAG, "RoleManager service unavailable for role=$roleName")
            return false
        }

        return try {
            if (!roleManager.isRoleAvailable(androidRole)) {
                Log.w(TAG, "Android role is not available: role=$roleName")
                return false
            }

            if (roleManager.isRoleHeld(androidRole)) {
                Log.d(TAG, "Android role already held: role=$roleName")
                if (responseMode == ROLE_RESPONSE_STATUS) {
                    promise.resolve(buildBlockingCapability().toWritableMap(event = "already_granted"))
                } else {
                    promise.resolve(true)
                }
                return true
            }

            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                Log.w(TAG, "Cannot request role=$roleName because currentActivity is null")
                return false
            }

            val intent = roleManager.createRequestRoleIntent(androidRole)
            roleRequestPromise = promise
            roleRequestResponseMode = responseMode
            pendingRoleName = roleName
            Log.d(TAG, "Launching Android role request: role=$roleName")
            activity.startActivityForResult(intent, requestCode)
            true
        } catch (error: SecurityException) {
            clearPendingRoleRequest()
            Log.e(TAG, "SecurityException while requesting Android role=$roleName", error)
            false
        } catch (error: Exception) {
            clearPendingRoleRequest()
            Log.e(TAG, "Unable to launch Android role request: role=$roleName", error)
            false
        }
    }

    private fun startDefaultSmsRoleRequest(promise: Promise, responseMode: String): Boolean {
        val status = buildBlockingCapability()
        if (status.isDefaultSmsApp) {
            if (responseMode == ROLE_RESPONSE_STATUS) {
                promise.resolve(status.toWritableMap(event = "already_granted"))
            } else {
                promise.resolve(true)
            }
            return true
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val started = startRoleRequest(
                roleName = ROLE_NAME_DEFAULT_SMS,
                androidRole = RoleManager.ROLE_SMS,
                requestCode = REQUEST_CODE_DEFAULT_SMS,
                promise = promise,
                responseMode = responseMode
            )
            if (started) return true
        }

        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            Log.w(TAG, "Cannot request Default SMS app role because currentActivity is null")
            return false
        }

        return try {
            val intent = Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT).apply {
                putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, reactApplicationContext.packageName)
            }
            roleRequestPromise = promise
            roleRequestResponseMode = responseMode
            pendingRoleName = ROLE_NAME_DEFAULT_SMS
            Log.d(TAG, "Launching legacy Default SMS app request")
            activity.startActivityForResult(intent, REQUEST_CODE_DEFAULT_SMS)
            true
        } catch (error: Exception) {
            clearPendingRoleRequest()
            Log.e(TAG, "Unable to launch Default SMS app request", error)
            false
        }
    }

    private fun getDefaultSmsPackage(): String? {
        return try {
            Telephony.Sms.getDefaultSmsPackage(reactApplicationContext)
        } catch (error: Exception) {
            Log.w(TAG, "Unable to read default SMS package", error)
            null
        }
    }

    private fun getDefaultDialerPackage(): String? {
        return try {
            val telecomManager = reactApplicationContext.getSystemService(
                Context.TELECOM_SERVICE
            ) as? TelecomManager
            telecomManager?.defaultDialerPackage
        } catch (error: Exception) {
            Log.w(TAG, "Unable to read default dialer package", error)
            null
        }
    }

    private fun isAndroidRoleHeld(androidRole: String?): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || androidRole == null) return false

        return try {
            val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as? RoleManager
            roleManager?.isRoleHeld(androidRole) == true
        } catch (error: Exception) {
            Log.w(TAG, "Unable to check Android role held: role=$androidRole", error)
            false
        }
    }

    private fun isAndroidRoleAvailable(androidRole: String?): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || androidRole == null) return false

        return try {
            val roleManager = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as? RoleManager
            roleManager?.isRoleAvailable(androidRole) == true
        } catch (error: Exception) {
            Log.w(TAG, "Unable to check Android role availability: role=$androidRole", error)
            false
        }
    }

    private fun blockResult(
        success: Boolean,
        sender: String,
        code: String,
        message: String,
        requiresRole: Boolean = false,
        status: BlockingCapability? = null
    ): WritableMap {
        return Arguments.createMap().apply {
            putBoolean("success", success)
            putString("sender", sender)
            putString("code", code)
            putString("message", message)
            putBoolean("requiresRole", requiresRole)
            status?.let { putMap("status", it.toWritableMap(event = "block_result")) }
        }
    }

    private fun BlockingCapability.toWritableMap(
        event: String,
        requestedRole: String? = null,
        requestResultCode: Int? = null,
        errorCode: String? = null,
        errorMessage: String? = null
    ): WritableMap {
        return Arguments.createMap().apply {
            putString("event", event)
            putInt("apiLevel", apiLevel)
            putString("manufacturer", manufacturer)
            putString("brand", brand)
            putString("model", model)
            putBoolean("isRealmeFamily", isRealmeFamily)
            putString("defaultSmsPackage", defaultSmsPackage)
            putString("defaultDialerPackage", defaultDialerPackage)
            putBoolean("isDefaultSmsApp", isDefaultSmsApp)
            putBoolean("hasCallScreeningRole", hasCallScreeningRole)
            putBoolean("isCallScreeningRoleAvailable", isCallScreeningRoleAvailable)
            putBoolean("isSmsRoleAvailable", isSmsRoleAvailable)
            putBoolean("canCurrentUserBlockNumbers", canCurrentUserBlockNumbers)
            putBoolean("canBlockSender", canBlockSender)
            requestedRole?.let { putString("requestedRole", it) }
            requestResultCode?.let { putInt("requestResultCode", it) }
            errorCode?.let { putString("errorCode", it) }
            errorMessage?.let { putString("errorMessage", it) }
        }
    }

    private fun logBlockingCapability(prefix: String, status: BlockingCapability) {
        Log.d(
            TAG,
            "$prefix: api=${status.apiLevel} manufacturer=${status.manufacturer} " +
                "model=${status.model} realmeFamily=${status.isRealmeFamily} " +
                "defaultSms=${status.isDefaultSmsApp} defaultSmsPackage=${status.defaultSmsPackage} " +
                "callScreening=${status.hasCallScreeningRole} " +
                "callScreeningAvailable=${status.isCallScreeningRoleAvailable} " +
                "smsRoleAvailable=${status.isSmsRoleAvailable} " +
                "defaultDialer=${status.defaultDialerPackage} " +
                "canCurrentUserBlockNumbers=${status.canCurrentUserBlockNumbers} " +
                "canBlock=${status.canBlockSender}"
        )
    }

    private fun clearPendingRoleRequest() {
        roleRequestPromise = null
        roleRequestResponseMode = ROLE_RESPONSE_BOOLEAN
        pendingRoleName = ROLE_NAME_UNKNOWN
    }

    private fun openAppSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${reactApplicationContext.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(intent)
    }

    private fun isIgnoringBatteryOptimizations(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true

        val powerManager = reactApplicationContext.getSystemService(
            Context.POWER_SERVICE
        ) as? PowerManager
        return powerManager?.isIgnoringBatteryOptimizations(
            reactApplicationContext.packageName
        ) == true
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val enabledListeners = Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false

        return enabledListeners
            .split(':')
            .any { component ->
                component.contains(reactApplicationContext.packageName, ignoreCase = true)
            }
    }

    private fun startFirstAvailableActivity(intents: List<Intent>, label: String): Boolean {
        for (intent in intents) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                reactApplicationContext.startActivity(intent)
                Log.d(TAG, "Opened $label via ${intent.component ?: intent.action}")
                return true
            } catch (error: Exception) {
                Log.d(TAG, "Unable to open $label via ${intent.component ?: intent.action}")
            }
        }

        return try {
            openAppSettings()
            true
        } catch (error: Exception) {
            Log.e(TAG, "Unable to open app settings fallback for $label", error)
            false
        }
    }

    private fun buildManufacturerSettingsIntents(): List<Intent> {
        val packageUri = Uri.parse("package:${reactApplicationContext.packageName}")
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intents = mutableListOf<Intent>()

        if (
            manufacturer.contains("realme") ||
            manufacturer.contains("oppo") ||
            manufacturer.contains("oneplus")
        ) {
            intents += listOf(
                componentIntent(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                ),
                componentIntent(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.startupapp.StartupAppListActivity"
                ),
                componentIntent(
                    "com.oplus.safecenter",
                    "com.oplus.safecenter.permission.startup.StartupAppListActivity"
                ),
                componentIntent(
                    "com.oplus.safecenter",
                    "com.oplus.safecenter.startupapp.StartupAppListActivity"
                ),
                componentIntent(
                    "com.oppo.safe",
                    "com.oppo.safe.permission.startup.StartupAppListActivity"
                ),
                componentIntent(
                    "com.coloros.oppoguardelf",
                    "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity"
                ),
                componentIntent(
                    "com.oplus.battery",
                    "com.oplus.powermanager.fuelgaue.PowerUsageModelActivity"
                ),
                componentIntent(
                    "com.coloros.oppoguardelf",
                    "com.coloros.oppoguardelf.MonitoredPkgActivity"
                ),
                componentIntent(
                    "com.oneplus.security",
                    "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"
                ),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = packageUri
                }
            )
        } else if (
            manufacturer.contains("xiaomi") ||
            manufacturer.contains("redmi") ||
            manufacturer.contains("poco")
        ) {
            intents += listOf(
                componentIntent(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity"
                ),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = packageUri
                }
            )
        }

        if (intents.isEmpty()) {
            intents += Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = packageUri
            }
        }

        return intents
    }

    private fun componentIntent(packageName: String, className: String): Intent {
        return Intent().setComponent(ComponentName(packageName, className))
    }

    private fun drainPendingSmsEvents() {
        if (!canEmitToJs()) return

        val pendingEvents = readPendingEvents(reactApplicationContext)
        if (pendingEvents.isEmpty()) return

        Log.d(TAG, "Draining ${pendingEvents.size} queued SMS event(s) to JS")
        val remainingEvents = mutableListOf<PendingSmsEvent>()

        for (event in pendingEvents) {
            if (!sendSmsToJs(event)) {
                remainingEvents.add(event)
            }
        }

        writePendingEvents(reactApplicationContext, remainingEvents)
    }

    private fun sendSmsToJs(event: PendingSmsEvent): Boolean {
        if (!canEmitToJs()) {
            Log.d(TAG, "React instance/listener unavailable; SMS event will stay queued")
            return false
        }

        val params = Arguments.createMap().apply {
            putString("id", event.id)
            putString("sender", event.sender)
            putString("message", event.message)
            putString("source", event.source)
            putDouble("timestamp", event.timestamp)
        }

        return try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_SMS_RECEIVED, params)
            Log.d(
                TAG,
                "Emitted SMS event to JS from ${event.sender} " +
                    "(${event.message.length} chars, source=${event.source})"
            )
            true
        } catch (error: Exception) {
            Log.e(TAG, "Failed to emit SMS event to JS", error)
            false
        }
    }

    private fun canEmitToJs(): Boolean {
        return listenerCount > 0 && reactApplicationContext.hasActiveReactInstance()
    }

    companion object {
        const val SOURCE_BROADCAST_RECEIVER = "broadcast_receiver"
        const val SOURCE_DEFAULT_SMS_RECEIVER = "default_sms_receiver"
        const val SOURCE_NOTIFICATION_LISTENER = "notification_listener"

        private const val TAG = "SmsModule"
        private const val MODULE_NAME = "SmsModule"
        private const val EVENT_SMS_RECEIVED = "onSmsReceived"
        private const val PREFS_NAME = "kinetic_vault_sms"
        private const val KEY_AUTO_SCAN_ENABLED = "auto_scan_enabled"
        private const val KEY_PENDING_EVENTS = "pending_sms_events"
        private const val KEY_RECENT_EVENTS = "recent_sms_events"
        private const val MAX_PENDING_EVENTS = 25
        private const val DEDUPE_WINDOW_MS = 2 * 60 * 1000L
        private const val REQUEST_CODE_CALL_SCREENING = 1001
        private const val REQUEST_CODE_DEFAULT_SMS = 1002
        private const val ROLE_RESPONSE_BOOLEAN = "boolean"
        private const val ROLE_RESPONSE_STATUS = "status"
        private const val ROLE_NAME_CALL_SCREENING = "call_screening"
        private const val ROLE_NAME_DEFAULT_SMS = "default_sms"
        private const val ROLE_NAME_UNKNOWN = "unknown"

        @Volatile
        private var smsModuleInstance: SmsModule? = null

        fun shouldCaptureIncomingSms(context: Context): Boolean {
            return isAutoScanEnabled(context) ||
                (smsModuleInstance?.listenerCount ?: 0) > 0
        }

        fun emitSmsEvent(
            context: Context,
            sender: String,
            message: String,
            source: String = SOURCE_BROADCAST_RECEIVER
        ) {
            val appContext = context.applicationContext
            if (!shouldCaptureIncomingSms(appContext)) {
                Log.d(TAG, "SMS event discarded because auto-scan is disabled")
                return
            }

            val now = System.currentTimeMillis()
            val normalizedMessage = message.trim()
            val normalizedSender = sender.trim().ifBlank { "Unknown" }
            val eventKey = buildEventKey(normalizedSender, normalizedMessage)

            if (markDuplicateAndReturnIfSeen(appContext, eventKey, now)) {
                Log.d(TAG, "Duplicate SMS event ignored (source=$source)")
                return
            }

            val event = PendingSmsEvent(
                id = "$now-${normalizedSender.hashCode()}-${normalizedMessage.hashCode()}",
                sender = normalizedSender,
                message = normalizedMessage,
                source = source,
                timestamp = now.toDouble()
            )

            val emitted = smsModuleInstance?.sendSmsToJs(event) == true
            if (!emitted) {
                persistPendingEvent(appContext, event)
                Log.d(TAG, "Queued SMS event for JS delivery (source=$source)")
            }
        }

        fun isAutoScanEnabled(context: Context): Boolean {
            return getPrefs(context).getBoolean(KEY_AUTO_SCAN_ENABLED, false)
        }

        private fun setAutoScanEnabled(context: Context, enabled: Boolean) {
            getPrefs(context)
                .edit()
                .putBoolean(KEY_AUTO_SCAN_ENABLED, enabled)
                .apply()

            if (!enabled) {
                writePendingEvents(context, emptyList())
            }

            Log.d(TAG, "Native SMS auto-scan preference set to $enabled")
        }

        private fun isRealmeFamilyDevice(): Boolean {
            val manufacturer = Build.MANUFACTURER.lowercase()
            val brand = Build.BRAND.lowercase()

            return manufacturer.contains("realme") ||
                manufacturer.contains("oppo") ||
                manufacturer.contains("oneplus") ||
                brand.contains("realme") ||
                brand.contains("oppo") ||
                brand.contains("oneplus")
        }

        private fun getPrefs(context: Context) =
            context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        @Synchronized
        private fun persistPendingEvent(context: Context, event: PendingSmsEvent) {
            val events = readPendingEvents(context)
                .toMutableList()
                .apply { add(event) }
                .takeLast(MAX_PENDING_EVENTS)

            writePendingEvents(context, events)
        }

        @Synchronized
        private fun readPendingEvents(context: Context): List<PendingSmsEvent> {
            val rawEvents = getPrefs(context).getString(KEY_PENDING_EVENTS, "[]") ?: "[]"

            return try {
                val events = JSONArray(rawEvents)
                buildList {
                    for (index in 0 until events.length()) {
                        val item = events.optJSONObject(index) ?: continue
                        val sender = item.optString("sender")
                        val message = item.optString("message")
                        if (sender.isBlank() || message.isBlank()) continue

                        add(
                            PendingSmsEvent(
                                id = item.optString("id"),
                                sender = sender,
                                message = message,
                                source = item.optString("source", SOURCE_BROADCAST_RECEIVER),
                                timestamp = item.optDouble(
                                    "timestamp",
                                    System.currentTimeMillis().toDouble()
                                )
                            )
                        )
                    }
                }
            } catch (error: Exception) {
                Log.e(TAG, "Failed to read queued SMS events", error)
                emptyList()
            }
        }

        @Synchronized
        private fun writePendingEvents(context: Context, events: List<PendingSmsEvent>) {
            val json = JSONArray()
            for (event in events) {
                json.put(
                    JSONObject()
                        .put("id", event.id)
                        .put("sender", event.sender)
                        .put("message", event.message)
                        .put("source", event.source)
                        .put("timestamp", event.timestamp)
                )
            }

            getPrefs(context)
                .edit()
                .putString(KEY_PENDING_EVENTS, json.toString())
                .apply()
        }

        private fun buildEventKey(sender: String, message: String): String {
            val compactMessage = message.replace(Regex("\\s+"), " ").trim().lowercase()
            return "${sender.lowercase()}|$compactMessage".hashCode().toString()
        }

        @Synchronized
        private fun markDuplicateAndReturnIfSeen(
            context: Context,
            eventKey: String,
            now: Long
        ): Boolean {
            val rawEvents = getPrefs(context).getString(KEY_RECENT_EVENTS, "{}") ?: "{}"
            val recentEvents = try {
                JSONObject(rawEvents)
            } catch (_: Exception) {
                JSONObject()
            }

            val cleanedEvents = JSONObject()
            var alreadySeen = false
            val keys = recentEvents.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val seenAt = recentEvents.optLong(key, 0L)
                if (now - seenAt <= DEDUPE_WINDOW_MS) {
                    cleanedEvents.put(key, seenAt)
                    if (key == eventKey) {
                        alreadySeen = true
                    }
                }
            }

            if (!alreadySeen) {
                cleanedEvents.put(eventKey, now)
            }

            getPrefs(context)
                .edit()
                .putString(KEY_RECENT_EVENTS, cleanedEvents.toString())
                .apply()

            return alreadySeen
        }
    }
}

private data class PendingSmsEvent(
    val id: String,
    val sender: String,
    val message: String,
    val source: String,
    val timestamp: Double
)

private data class BlockingCapability(
    val apiLevel: Int,
    val manufacturer: String,
    val brand: String,
    val model: String,
    val isRealmeFamily: Boolean,
    val defaultSmsPackage: String?,
    val defaultDialerPackage: String?,
    val isDefaultSmsApp: Boolean,
    val hasCallScreeningRole: Boolean,
    val isCallScreeningRoleAvailable: Boolean,
    val isSmsRoleAvailable: Boolean,
    val canCurrentUserBlockNumbers: Boolean,
    val canBlockSender: Boolean
)
