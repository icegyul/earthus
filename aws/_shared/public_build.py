# -*- coding: utf-8 -*-
"""공개 빌드 원본 — INTEGRATION-3 §0 · §1.

**prototype/ 을 통째로 공개 원본으로 쓰지 않는다.**

왜 바꾸나: INTEGRATION-2 는 `deploy-app.sh` 의 `aws s3 sync` 에 `--exclude` 를 몇 줄
더해서 초안 유출을 막았다. 그건 *알고 있는* 구멍 하나를 막은 것이지 경계를 만든 것이
아니다. 실제로 그 뒤에도 `prototype/v2-deploy/engine-v11/postgres/*.sql`(DB 스키마)과
저장소 안쪽 문서용 `README.md` 들이 그대로 공개 주소로 올라가고 있었다 —
`supabase/*` 만 제외했기 때문이다.

그래서 규칙을 뒤집는다:

    작업 트리 → (명시적 거름망) → build/public-app/ → S3

배포는 **걸러진 디렉터리만** 올린다. `--exclude` 는 한 줄도 쓰지 않는다.
빠뜨린 규칙이 있으면 파일이 조용히 새는 게 아니라, 빌드가 **멈춘다**(§1 누출 시험).

⚠️ "런타임에서 숨기면 된다"는 허용하지 않는다. 공개 버킷에 올라간 파일은
   화면이 감춰도 주소만 알면 그대로 읽힌다.
"""

import fnmatch
import hashlib
import io
import json
import os
import re
import shutil

# 저장소 기준 상대 경로.
SOURCE_DIR = "prototype"
PUBLIC_BUILD_DIR = "build/public-app"      # .gitignore 의 build/ 아래다

# ── 거름망 ───────────────────────────────────────────────────────────────────
# (규칙, 왜 비공개인가)
#   'a/b/'    로 끝나면 그 디렉터리 전체
#   '*' 포함  이면 상대 경로 전체에 대한 fnmatch. '/' 가 없으면 파일 이름에도 맞춰 본다
#   그 밖은   정확한 상대 경로
#
# ⚠️ 여기에 없는 것은 **공개된다.** 새 디렉터리를 만들 때 이 표를 먼저 본다.
#
# KEEP_RULES 는 거름망보다 **먼저** 본다. 넓은 규칙(예: '*.md')을 쓰면서
# 앱이 실제로 읽는 몇 개만 남기려고 있다. 좁은 예외를 명시적으로 적는다.
KEEP_RULES = (
    ("legal/*.ko.md", "앱이 화면에 띄우는 약관·개인정보·자료 라이선스 (js/ui-account.js)"),
    # ⚠️ canary/ 를 통째로 막았더니 **실제 배포가 깨졌다.**
    #    tools/manifests/free-open-policy-files.tsv 와 ocean-aetherus-v3-canary-files.tsv
    #    가 이 세 파일을 운영에 올린다 — 점검용 부스러기가 아니라 공개 화면이다.
    #    (같은 디렉터리의 rc-rollback-probe.json 은 점검 산출물이라 그대로 막는다)
    ("canary/ocean-aetherus-v3/*", "실제로 배포되는 카나리 화면. tools/manifests/*.tsv 가 올린다"),
)

DENY_RULES = (
    # 개발 전용 — 서버·인증서
    (".devcert.pem",        "개발용 자체 서명 인증서"),
    (".devkey.pem",         "개발용 개인키"),
    ("devserver.py",        "개발 서버. 배포본에 필요 없다"),

    # 데이터베이스 — 테이블·RLS 정책·RPC 이름이 그대로 드러난다
    ("supabase/",           "DB 스키마·마이그레이션·함수"),
    ("*.sql",               "DB 스키마. v2-deploy/engine-v11/postgres/ 처럼 supabase/ 밖에도 있다"),

    # 저장소 안쪽 문서. 앱이 화면에 띄우는 법무 문서(legal/*.ko.md)만 예외다.
    # ⚠️ 예전에는 README.md 만 막았다. 그래서 v2-three/NEXT_STEPS.md(내부 로드맵),
    #    js/ext/CONTRACT.md, v3-paper/handoff/*.md(인계 문서 17건)가 그대로 공개됐다.
    ("*.md",                "저장소 안쪽 문서. 앱이 읽는 것은 legal/*.ko.md 뿐이다"),

    # v3 종이 지구 — **자기 배포 스크립트(aws/deploy-v3-paper.sh)가 빼는 것들**.
    # ⚠️ 실제로 있었던 일: deploy-v3-paper.sh 는 tools/·handoff/·원본 PNG 를 조심스럽게
    #    제외하는데, deploy-app.sh 가 prototype/ 을 통째로 올리면서 app/v3-paper/ 아래에
    #    그 전부를 다시 공개했다. 거르는 쪽과 올리는 쪽이 달라서 생긴 구멍이다.
    ("v3-paper/tools/",          "자료 준비 스크립트·벤더 패키지·위성 원본 (12MB)"),
    ("v3-paper/handoff/",        "내부 인계 문서와 이미지 생성 프롬프트"),
    ("v3-paper/verify-*.mjs",    "검토 도구"),
    ("v3-paper/build-package.py", "포장 도구"),
    ("v3-paper/preview-server.mjs", "미리보기 서버"),
    ("v3-paper/assets/*.png",    "제작 원본 PNG. 배포는 tools/v3-webp.py 가 만든 .webp 만"),
    ("v3-paper/assets/*/*.png",  "제작 원본 PNG"),
    ("*.zip",                    "원본 묶음"),

    # v3 키즈 — 인증이 아예 없는 저작 도구
    ("v3-kids/character-studio.html", "캐릭터 저작 도구. 인증이 없다"),
    ("v3-kids/character-studio.js",   "캐릭터 저작 도구"),
    ("v3-kids/character-studio.css",  "캐릭터 저작 도구"),

    # 실험 배포 확인용
    ("canary/",             "카나리 점검 산출물. 배포되는 화면은 위 KEEP_RULES 가 통과시킨다"),

    # ── INTEGRATION-4 §5 — 부류별로 훑어 찾은 것들 ──────────────────────────
    # 전부 "앱이 읽지 않는다"를 실제로 확인하고 넣었다. 참조가 있는 것은 넣지 않았다.
    ("v3-paper/data/*.py",  "자료 준비 스크립트(numpy·PIL). 브라우저가 읽지 않는다"),
    ("v3-paper/data/trench-bathymetry-audit.json",
                            "감사 산출물. 제품 자료가 아니다 — handoff/PACKAGE.json 만 가리킨다"),
    ("v3-paper/data/weather-source-*.json",
                            "개발 중 받아 둔 피드 사본(2026-09-04 고정). 런타임은 S3 를 직접 읽는다"),
    ("v3-kids/characters/*/*_master_sheet.png",
                            "캐릭터 제작 원본 시트. 런타임은 runtime_3q·parts_atlas 만 읽는다"),
    ("v3-kids/character-config.js", "캐릭터 저작 도구 설정. character-studio.js 만 읽는다"),
    ("js/earthus2/config/", "내부 통합 명세(커밋 SHA·경로 상태·전달 계획). 앱이 읽지 않는다"),
    ("js/earthus2/*/qa/*",  "QA 하네스(결함 주입 등). 제품 코드가 아니다"),
    ("js/config.local.example.js", "개발자 설정 서식. 앱이 읽지 않는다"),
    ("space/skybox/*/source-*.webp", "제작 원본 파노라마"),
    ("space/skybox/*/panorama.webp", "해시 없는 옛 파노라마. 매니페스트가 고른 세 장만 쓴다"),
    ("space/skybox/*/panorama-6000.webp", "해시 없는 옛 파노라마"),

    # 승인되지 않은 산출물 (INTEGRATION-2 §5 에서 확인된 실제 유출)
    ("events/distribution-content/",     "배포 후보 본문. status=DRAFT, 그중 eligibility=BLOCKED 도 있었다"),
    ("events/distribution-content.json", "배포 후보 색인"),
    ("events/social-drafts.json",        "SNS 초안. 사람이 승인하기 전 문구다"),

    # 시험·검증 부스러기
    ("_verify/",            "브라우저 검증용 임시 파일"),
    ("*/_verify/",          "브라우저 검증용 임시 파일"),
    ("*.bak", "편집 부산물"), ("*.orig", "병합 부산물"), ("*.rej", "병합 부산물"),
    ("*.log", "로그"),

    # 운영체제·도구 부산물
    (".DS_Store", "macOS 부산물"), ("._*", "macOS AppleDouble"),
    ("__pycache__/", "파이썬 캐시"), ("*/__pycache__/", "파이썬 캐시"),
    ("*.pyc", "파이썬 캐시"),
    (".tmp/", "임시"), ("*/.tmp/", "임시"),
)

# ── 공개하기로 **결정한** 것 ─────────────────────────────────────────────────
# 아래 누출 시험은 "git 이 일부러 빼 둔 파일이 공개로 나간다"를 잡는다.
# 그중에는 공개가 맞는 것도 있다 — 그런 것은 여기에 **이유와 함께** 적는다.
# 조용히 통과시키지 않는다: 적혀 있지 않으면 빌드가 멈춘다.
PUBLIC_BY_DECISION = {
    "js/config.local.js":
        "앱이 로그인·결제에 쓴다. Supabase anon 키는 공개 전제이고(RLS 로 보호), "
        "사업자 정보는 법적으로 공개 대상이다. "
        "⚠️ 다만 ADMIN_UIDS 가 함께 실려 나간다 — 운영자 UUID 노출이다. "
        "서버로 옮겨야 한다(INTEGRATION-3 인계 참고).",
    "v3-paper/":
        "종이 지구 화면과 자산. 용량 때문에 git 에 없을 뿐 제품이다. "
        "비공개 부분(tools/·handoff/·원본 PNG)은 위 DENY_RULES 가 따로 막는다.",
    "v3-kids/":
        "키즈 화면과 124종 자산. 용량 때문에 git 에 없을 뿐 제품이다. "
        "저작 도구(character-studio.*)만 DENY_RULES 로 막는다.",
    "v2-deploy/":
        "tools/build-v2-bundle.sh 가 만든 v2 배포 번들. 생성물이지만 공개 대상이다.",
    "data/": "생성된 지도·기후 자료. 용량 때문에 git 에 없다.",
    "ocean/": "생성된 해양 자료.",
    "events/": "공개 사건 피드. 승인 전 산출물은 위에서 따로 막는다.",
    "space/": "생성된 천체 자료.",
    "shots/": "공개 미리보기 이미지.",
    "img/": "앱 이미지.",
    "logo/": "브랜드 이미지.",
    "vendor/": "서드파티 라이브러리.",
}

# 거름망이 **빠뜨렸을 때** 잡는 그물. 규칙표와 독립적으로 판정한다.
# 규칙을 새로 안 적어도 위험한 파일이 통과하면 빌드가 멈춘다.
SECRET_EXTS = (".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".sql", ".env")
SECRET_NAME_PARTS = ("secret", "credential", "id_rsa", "private-key", "privatekey", ".env")
# 이름 검사는 **자료 파일에만** 건다. 소스 모듈은 내용으로 판단한다.
# 실제로 걸렸다: js/earthus2/v07/backend/secret-vault-adapter.js 는 비밀을 담은 파일이
# 아니라 "비밀은 값이 아니라 참조로 들고 다녀라"를 강제하는 코드다. 그런 것까지 유출로
# 부르는 검사기는 곧 무시당한다 — 대신 아래 SECRET_PATTERNS 가 값 자체를 찾는다.
DATA_EXTS = (".json", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".txt", ".env", "")
SCAN_TEXT_EXTS = (".js", ".mjs", ".cjs", ".json", ".html", ".htm", ".css", ".md",
                  ".txt", ".yml", ".yaml", ".toml", ".sh", ".py", ".webmanifest", "")
SCAN_MAX_BYTES = 2 * 1024 * 1024

# 내용에서 찾는 표식. **문구가 아니라 값을 찾는다** —
# admin.html 에는 "service_role 키를 절대 넣지 마십시오" 라는 *경고문*이 있다.
# 그런 문장을 유출로 잡는 검사기는 곧 무시당한다(INTEGRATION-2 에서 겪었다).
SECRET_PATTERNS = (
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "개인키 블록"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AWS 액세스 키 ID"),
    (re.compile(r"\baws_secret_access_key\s*[:=]\s*[\"']?[A-Za-z0-9/+=]{30,}", re.I), "AWS 비밀 키"),
    (re.compile(r"\bservice_role[_ ]?key\s*[:=]\s*[\"'][A-Za-z0-9._\-]{24,}", re.I), "Supabase service_role 키"),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}"), "Slack 토큰"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"), "GitHub 토큰"),
)


class PublicBuildError(RuntimeError):
    pass


def _norm(rel):
    rel = rel.replace("\\", "/")
    while rel.startswith("./"):
        rel = rel[2:]
    return rel


def _matches(rule, rel, base):
    if rule.endswith("/"):
        if "*" in rule:
            # '*/__pycache__/' 같은 규칙 — 경로 중간의 디렉터리를 잡는다
            seg = rule.strip("*/")
            return ("/%s/" % seg) in ("/" + rel)
        return rel.startswith(rule)
    if "*" in rule:
        if fnmatch.fnmatch(rel, rule):
            return True
        return "/" not in rule and fnmatch.fnmatch(base, rule)
    return rel == rule


def keep_for(rel):
    """거름망보다 먼저 통과시키기로 한 것인가."""
    rel = _norm(rel)
    base = rel.rsplit("/", 1)[-1]
    for rule, reason in KEEP_RULES:
        if _matches(rule, rel, base):
            return rule, reason
    return None


def denial_for(rel):
    """이 상대 경로가 거름망에 걸리나. 걸리면 (규칙, 사유), 아니면 None.

    허용 규칙이 먼저다 — legal/terms.ko.md 는 '*.md' 에 걸리지만 앱이 읽는다.
    """
    rel = _norm(rel)
    if keep_for(rel):
        return None
    base = rel.rsplit("/", 1)[-1]
    for rule, reason in DENY_RULES:
        if rule.endswith("/"):
            if "*" in rule:
                # '*/__pycache__/' 같은 규칙 — 경로 중간의 디렉터리를 잡는다
                seg = rule.strip("*/")
                if ("/%s/" % seg) in ("/" + rel):
                    return rule, reason
            elif rel.startswith(rule):
                return rule, reason
        elif "*" in rule:
            if fnmatch.fnmatch(rel, rule):
                return rule, reason
            if "/" not in rule and fnmatch.fnmatch(base, rule):
                return rule, reason
        elif rel == rule:
            return rule, reason
    return None


def walk_source(src):
    """원본 트리의 상대 경로를 정렬해 돌려준다."""
    out = []
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
        for f in files:
            out.append(_norm(os.path.relpath(os.path.join(root, f), src)))
    out.sort()
    return out


def plan(src):
    """무엇을 올리고 무엇을 빼는지 정한다. 파일은 건드리지 않는다."""
    keep, denied = [], []
    for rel in walk_source(src):
        hit = denial_for(rel)
        if hit:
            denied.append({"path": rel, "rule": hit[0], "reason": hit[1]})
        else:
            keep.append(rel)
    return {"keep": keep, "denied": denied}


def _read_text(path):
    try:
        with io.open(path, "r", encoding="utf-8", errors="ignore") as fh:
            return fh.read(SCAN_MAX_BYTES)
    except OSError:
        return ""


def _artifact_problems(rel, text):
    """공개될 JSON 안에 승인 전 산출물이 들어 있나.

    경계 판정은 publication_privacy 한 곳에서만 한다 — 여기서 다시 정의하지 않는다.
    """
    try:
        doc = json.loads(text)
    except Exception:                                   # noqa: BLE001
        return []
    try:
        from publication_privacy import scan_public_payload
    except ImportError:
        return []
    return [{"path": rel, "kind": "UNAPPROVED_ARTIFACT", "detail": p}
            for p in scan_public_payload(doc)]


def _git_ignored(src, rels):
    """git 이 일부러 빼 둔 파일들. 없으면 빈 집합(교차 확인을 건너뛴다)."""
    import subprocess
    if not rels:
        return set()
    # ⚠️ -z 가 필요하다. 기본 모드는 경로를 큰따옴표로 감싸 이스케이프하고
    #    윈도우에서는 줄 끝 \r 까지 섞여 들어와 접두사 비교가 전부 어긋난다.
    try:
        p = subprocess.run(
            ["git", "check-ignore", "-z", "--stdin"],
            cwd=src, input=("\0".join(rels) + "\0").encode("utf-8"),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except (OSError, ValueError):                       # git 이 없거나 실행 불가
        return set()
    if p.returncode not in (0, 1):                      # 2 = 오류
        return set()
    out = (p.stdout or b"").decode("utf-8", "replace")
    return {_norm(x) for x in out.split("\0") if x}


def _decided_public(rel):
    """공개하기로 적어 둔 것인가. 적혀 있으면 (규칙, 이유)."""
    for k, why in PUBLIC_BY_DECISION.items():
        if rel == k or (k.endswith("/") and rel.startswith(k)):
            return k, why
    return None


def residual_private(src, kept):
    """§1 누출 시험 — 거름망을 **통과한** 것 중에 비공개가 남았나.

    규칙표와 독립적으로 판정한다. 여기서 무언가 나오면 규칙표가 빠뜨린 것이다.
    돌려주는 것: [{path, kind, detail}]
    """
    problems = []
    for rel in kept:
        base = rel.rsplit("/", 1)[-1].lower()
        ext = os.path.splitext(base)[1]
        if ext in SECRET_EXTS:
            problems.append({"path": rel, "kind": "SECRET_EXT",
                             "detail": "확장자 %s 는 공개 대상이 아니다" % ext})
            continue
        if ext in DATA_EXTS and any(part in base for part in SECRET_NAME_PARTS):
            problems.append({"path": rel, "kind": "SECRET_NAME",
                             "detail": "파일 이름이 비밀을 가리킨다"})
            continue
        full = os.path.join(src, rel)
        try:
            if os.path.getsize(full) > SCAN_MAX_BYTES:
                continue
        except OSError:
            continue
        if ext not in SCAN_TEXT_EXTS:
            continue
        text = _read_text(full)
        if not text:
            continue
        hit = None
        for pat, what in SECRET_PATTERNS:
            if pat.search(text):
                hit = what
                break
        if hit:
            problems.append({"path": rel, "kind": "SECRET_VALUE", "detail": hit})
        elif ext == ".json":
            problems.extend(_artifact_problems(rel, text))

    # git 이 일부러 뺀 파일이 공개로 나가나. 결정 표에 적힌 것만 통과한다.
    # ⚠️ 이 교차 확인이 config.local.js 를 잡는다 — .gitignore 가 '절대 커밋 금지'라고
    #    적어 둔 파일인데 배포는 그대로 올리고 있었다.
    ignored = _git_ignored(src, kept)
    for rel in sorted(ignored):
        if _decided_public(rel):
            continue
        problems.append({"path": rel, "kind": "GIT_IGNORED_BUT_PUBLIC",
                         "detail": "git 이 일부러 뺀 파일이다. 공개가 맞으면 "
                                   "PUBLIC_BY_DECISION 에 이유를 적어라"})
    return problems


def _same(a, b):
    try:
        sa, sb = os.stat(a), os.stat(b)
    except OSError:
        return False
    return sa.st_size == sb.st_size and int(sa.st_mtime) == int(sb.st_mtime)


def build(src, out, *, strict=True):
    """걸러진 공개 원본을 만든다.

    strict=True 면 누출 시험에 걸린 것이 하나라도 있을 때 **멈춘다**.
    돌려주는 것: 매니페스트.
    """
    p = plan(src)
    residual = residual_private(src, p["keep"])
    if residual and strict:
        raise PublicBuildError(
            "공개 빌드 누출 시험 실패 — %d건. 거름망(DENY_RULES)에 규칙을 더하거나 파일을 옮겨라:\n%s"
            % (len(residual),
               "\n".join("  %s  [%s] %s" % (r["path"], r["kind"], r["detail"])
                         for r in residual[:20])))

    copied = removed = 0
    want = set(p["keep"])
    for rel in p["keep"]:
        s, d = os.path.join(src, rel), os.path.join(out, rel)
        if _same(s, d):
            continue
        dd = os.path.dirname(d)
        if dd and not os.path.isdir(dd):
            os.makedirs(dd)
        shutil.copy2(s, d)
        copied += 1
    # 원본에서 사라졌거나 이제 막히는 것은 걸러진 트리에서도 지운다.
    # (S3 에는 --delete 권한이 없어 남지만, 적어도 다음 sync 가 다시 올리지는 않는다)
    if os.path.isdir(out):
        for rel in walk_source(out):
            if rel not in want:
                try:
                    os.remove(os.path.join(out, rel))
                    removed += 1
                except OSError:
                    pass
    return {
        "source": src, "out": out,
        "kept": len(p["keep"]), "denied": len(p["denied"]),
        "copied": copied, "removed": removed,
        "deniedPaths": p["denied"],
        "residual": residual,
        "rules": len(DENY_RULES),
    }


def manifest_hash(src, keep):
    """걸러진 목록의 지문. 무엇이 공개됐는지 기록으로 남긴다."""
    h = hashlib.sha256()
    for rel in sorted(keep):
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        try:
            h.update(str(os.path.getsize(os.path.join(src, rel))).encode("ascii"))
        except OSError:
            pass
        h.update(b"\n")
    return h.hexdigest()
