package net.earthus.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 앱 안 표식 규칙 시험 (2026-09-24). 결과로 쓴다: "모든 진입 URL 이 src=twa 를 **가져야** 통과".
 * 진입 경로 넷(아이콘·App Link·알림·공유)이 실제로 들고 오는 URL 모양을 그대로 넣었다.
 */
public class EntryMarkerTest {

    @Test
    public void launcherStartUrlIsKeptAsIs() {
        // 런처 아이콘: start_url 이 이미 /?src=twa 다 — 두 번 붙이지 않는다.
        assertEquals("src=twa", EntryMarker.markQuery("src=twa"));
    }

    @Test
    public void appLinkWithoutQueryGetsMarker() {
        // App Link: https://earthus.net/Intelligence
        assertEquals("src=twa", EntryMarker.markQuery(null));
        assertEquals("src=twa", EntryMarker.markQuery(""));
    }

    @Test
    public void existingQueryIsPreservedVerbatim() {
        // 태풍·지점 딥링크: 원래 쿼리를 인코딩 그대로 뒤에 남긴다('+'·%2B 가 바뀌면 안 된다).
        assertEquals("src=twa&tc=WP2026&station=108",
                EntryMarker.markQuery("tc=WP2026&station=108"));
        assertEquals("src=twa&q=a+b%2Bc", EntryMarker.markQuery("q=a+b%2Bc"));
    }

    @Test
    public void notificationDeepLinkGetsMarker() {
        // 알림: /v2/?tab=my&event=…
        assertEquals("src=twa&tab=my&event=kma-warn-1",
                EntryMarker.markQuery("tab=my&event=kma-warn-1"));
    }

    @Test
    public void otherSrcValueStaysButTwaComesFirst() {
        // 새 탭 확장 링크를 앱이 열었을 때: src=twa 가 첫 값이어야 웹 get('src') 가 twa 를 읽는다.
        assertEquals("src=twa&src=newtab", EntryMarker.markQuery("src=newtab"));
    }

    @Test
    public void laterTwaBehindOtherSrcStillGetsMarkerFirst() {
        // (2026-09-24 적대 검수 추가) src=twa 가 있어도 다른 src 뒤에 있으면 웹 get('src') 는 앞 값을 읽는다.
        // 결과 기준: 표시된 쿼리의 첫 src 값이 twa 여야 통과.
        assertEquals("src=twa&src=newtab&src=twa", EntryMarker.markQuery("src=newtab&src=twa"));
        assertEquals("src=twa&src=&a=1", EntryMarker.markQuery("src=&a=1"));
        assertEquals("src=twa&src", EntryMarker.markQuery("src"));
        assertEquals("a=1&src=twa&src=newtab", EntryMarker.markQuery("a=1&src=twa&src=newtab"));
    }

    @Test
    public void markerAnywhereIsDetected() {
        assertTrue(EntryMarker.hasMarker("a=1&src=twa"));
        assertFalse(EntryMarker.hasMarker("src=newtab&src=twa"));
        assertFalse(EntryMarker.hasMarker("src=twa2"));
        assertFalse(EntryMarker.hasMarker("xsrc=twa"));
        assertFalse(EntryMarker.hasMarker("src=TWA"));
    }

    @Test
    public void excludedPathsMatchManifestList() {
        assertTrue(EntryMarker.isExcludedPath("/admin.html"));
        assertTrue(EntryMarker.isExcludedPath("/studio.html"));
        assertTrue(EntryMarker.isExcludedPath("/legal/terms.ko.md"));
        assertFalse(EntryMarker.isExcludedPath("/"));
        assertFalse(EntryMarker.isExcludedPath(""));
        assertFalse(EntryMarker.isExcludedPath(null));
        assertFalse(EntryMarker.isExcludedPath("/v2/"));
        assertFalse(EntryMarker.isExcludedPath("/Intelligence"));
        assertFalse(EntryMarker.isExcludedPath("/legal"));
    }
}
