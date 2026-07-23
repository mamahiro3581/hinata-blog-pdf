package com.mamahiro3581.sakamichiblogpdf.ads

import android.app.Activity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform

class AdvertisingManager(private val activity: Activity) {
    private val consentInformation = UserMessagingPlatform.getConsentInformation(activity)
    private var initializedAds = false

    var privacyOptionsRequired by mutableStateOf(false)
        private set

    var canRequestAds by mutableStateOf(false)
        private set

    fun requestConsentAndStartAds() {
        val params = ConsentRequestParameters.Builder().build()
        consentInformation.requestConsentInfoUpdate(
            activity,
            params,
            {
                refreshPrivacyOptionsRequirement()
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) {
                    refreshPrivacyOptionsRequirement()
                    startAdsIfAllowed()
                }
                startAdsIfAllowed()
            },
            {
                refreshPrivacyOptionsRequirement()
                startAdsIfAllowed()
            },
        )
    }

    fun showPrivacyOptions() {
        UserMessagingPlatform.showPrivacyOptionsForm(activity) {
            refreshPrivacyOptionsRequirement()
            startAdsIfAllowed()
        }
    }

    private fun startAdsIfAllowed() {
        if (!initializedAds && consentInformation.canRequestAds()) {
            initializedAds = true
            canRequestAds = true
            MobileAds.initialize(activity)
        } else {
            canRequestAds = consentInformation.canRequestAds()
        }
    }

    private fun refreshPrivacyOptionsRequirement() {
        privacyOptionsRequired =
            consentInformation.privacyOptionsRequirementStatus ==
                ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
    }
}
