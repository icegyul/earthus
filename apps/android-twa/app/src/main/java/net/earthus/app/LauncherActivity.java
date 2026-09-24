/*
 * Copyright 2019 Google Inc. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 * EARTHUS 수정 (2026-09-24): Bubblewrap 1.25.0 템플릿의 LauncherActivity 를 바탕으로
 * getLaunchingUrl() 에 앱 안 표식(src=twa)을 더했다. 원래 템플릿의 방향 설정 코드는 그대로 둔다.
 */
package net.earthus.app;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;

/**
 * EARTHUS 런처 — AndroidManifest 에서 기본 런처 자리에 등록된 액티비티.
 *
 * 앱으로 들어오는 **모든** 진입(런처 아이콘 · App Link · 알림 · 공유 · 바로가기)은 이 액티비티를 거쳐
 * android-browser-helper 의 getLaunchingUrl() 로 URL 을 정한다. 여기서 그 URL 에 src=twa 를 붙인다.
 *
 * 왜 (지시서 §3-4 · verify-feasibility #2):
 *   start_url(/?src=twa) 하나만으로는 구멍이 난다. App Link·알림·공유로 들어온 앱은 start_url 을 거치지 않아
 *   웹 billing.js 가 '앱 밖'으로 판정하고 토스 결제창을 띄울 수 있다 — Play 결제 정책 위반(R1).
 *   웹은 첫 로드에서 이 값을 sessionStorage 에 적고 history.replaceState 로 쿼리를 지운다(웹 스트림 몫).
 *   localStorage 에 두면 안 된다 — TWA 는 Chrome 과 저장소를 공유해 일반 탭 사용자까지 '앱 안'이 된다.
 */
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    /**
     * App Links 제외 경로(/admin.html · /studio.html · /legal/*)의 Android 14 이하 받침.
     * Android 15+ 는 AndroidManifest 의 uri-relative-filter-group 이 아예 앱으로 보내지 않는다.
     * 14 이하는 그 요소를 모르므로 세 경로도 여기로 온다 → 앱(주소창 없는 전체 화면) 대신
     * 기본 브라우저의 Custom Tab(주소창 있음)으로 열고 이 액티비티는 닫는다.
     * Custom Tab 을 줄 브라우저가 없으면 원래대로 앱 안에서 연다(ACTION_VIEW 로 넘기면 다시 이 앱으로 돌아와 맴돈다).
     */
    @Override
    protected void launchTwa() {
        Uri incoming = getIntent() == null ? null : getIntent().getData();
        if (incoming != null && EntryMarker.isExcludedPath(incoming.getPath())) {
            String browser = CustomTabsClient.getPackageName(this, null);
            if (browser != null) {
                CustomTabsIntent tab = new CustomTabsIntent.Builder().build();
                tab.intent.setPackage(browser);
                tab.launchUrl(this, incoming);
                finish();
                return;
            }
        }
        super.launchTwa();
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();
        return withTwaMarker(uri);
    }

    /**
     * src=twa 를 붙인 URL. 조각(#v=1&at=… v2 화면 상태)은 Uri.Builder 가 그대로 지킨다.
     * 쿼리는 인코딩된 원문으로 다룬다(EntryMarker 설명 참고).
     */
    static Uri withTwaMarker(Uri uri) {
        if (uri == null || !uri.isHierarchical()) {
            return uri;
        }
        String query = uri.getEncodedQuery();
        if (EntryMarker.hasMarker(query)) {
            return uri;
        }
        return uri.buildUpon().encodedQuery(EntryMarker.markQuery(query)).build();
    }
}
