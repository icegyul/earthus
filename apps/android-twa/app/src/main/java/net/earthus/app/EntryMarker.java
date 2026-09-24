package net.earthus.app;

/**
 * 앱 안 표식(src=twa)을 붙이는 순수 문자열 규칙 (2026-09-24, 지시서 §3-4 신호 1).
 *
 * android.net.Uri 없이 쓴 이유: JVM 단위 시험(app/src/test)에서 그대로 돌리기 위해서다.
 * 쿼리는 **인코딩된 원문 그대로** 다룬다 — 디코드했다 다시 인코드하면 '+'·'%2B' 같은 값이 바뀔 수 있다.
 * 조각(#v=1&at=… 같은 v2 화면 상태)은 여기서 건드리지 않는다. 호출하는 쪽이 Uri.Builder 로 원래 조각을 지킨다.
 */
final class EntryMarker {
    static final String KEY = "src";
    static final String VALUE = "twa";
    static final String PAIR = KEY + "=" + VALUE;

    /**
     * App Link 로 앱이 열지 않을 경로 (지시서 §3-2 · verify-feasibility #23).
     * AndroidManifest 의 uri-relative-filter-group(allow=false) 과 같은 목록이다 — 한쪽만 고치지 말 것.
     */
    static final String[] EXCLUDED_EXACT = {"/admin.html", "/studio.html"};
    static final String[] EXCLUDED_PREFIX = {"/legal/"};

    private EntryMarker() {}

    /** 인코딩된 쿼리에 src=twa 가 이미 있는가. 값 비교는 원문 그대로(대소문자 구분).
     *  (2026-09-24 정정) '어딘가에 있는가'가 아니라 **첫 src 값이 twa 인가**로 바꿨다. 적대 검수에서 찾은 구멍:
     *  "src=newtab&src=twa" 는 예전 규칙으로 '이미 있음'이 되어 그대로 나갔고, 웹 URLSearchParams.get('src') 는
     *  첫 값 newtab 을 읽어 '앱 밖'으로 판정했다. 웹이 읽는 값(첫 src)을 기준으로 삼는다. */
    static boolean hasMarker(String encodedQuery) {
        if (encodedQuery == null || encodedQuery.isEmpty()) {
            return false;
        }
        for (String part : encodedQuery.split("&", -1)) {
            if (PAIR.equals(part)) {
                return true;
            }
            // 첫 src 가 twa 가 아니면(src=newtab · src= · src) 표식이 없는 것으로 본다 — 앞에 붙여야 한다.
            if (KEY.equals(part) || part.startsWith(KEY + "=")) {
                return false;
            }
        }
        return false;
    }

    /**
     * src=twa 를 **맨 앞**에 둔 새 쿼리를 돌려준다. 이미 있으면 원문 그대로 돌려준다.
     * 맨 앞에 두는 이유: 다른 src 값(예: 새 탭 확장이 붙인 src=newtab)이 이미 있을 때
     * 웹의 URLSearchParams.get('src') 는 첫 값을 읽는다. 원래 값은 지우지 않고 뒤에 남긴다(getAll 로 볼 수 있다).
     */
    static String markQuery(String encodedQuery) {
        if (hasMarker(encodedQuery)) {
            return encodedQuery;
        }
        if (encodedQuery == null || encodedQuery.isEmpty()) {
            return PAIR;
        }
        return PAIR + "&" + encodedQuery;
    }

    /** 앱이 열지 않을 경로인가. null·빈 경로는 첫 화면(/)이라 제외가 아니다. */
    static boolean isExcludedPath(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        for (String p : EXCLUDED_EXACT) {
            if (p.equals(path)) {
                return true;
            }
        }
        for (String p : EXCLUDED_PREFIX) {
            if (path.startsWith(p)) {
                return true;
            }
        }
        return false;
    }
}
