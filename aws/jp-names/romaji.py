# -*- coding: utf-8 -*-
"""일본어 로마자(헵번식) → 한글. **외래어 표기법 일본어 규칙**을 따른다.

왜 필요한가
  받은 지시: "일본어는 한국인 유저 디바이스 언어가 한국어면 한글로"
  ⚠️⚠️ 그런데 OSM 에 한국어 이름(name:ko)은 **1%뿐**이다 (해변 764곳 중 9곳).
     영문(헵번 로마자)은 30% 있다. 그래서 로마자에서 옮긴다.

⚠️⚠️ **한자를 한국 한자음으로 읽지 않는다.**
   실제로 OSM 의 한국어 이름 중에 枕状溶岩 → "침상용암" 이 있었다.
   그건 일본 지명이 아니라 한자를 한국식으로 읽은 것이다. 東京을 "동경"이라 하는 것과 같다.
   지금 한국에서 쓰는 표기가 아니다.

⚠️ 이건 **표기 변환**이지 공식 한국어 지명이 아니다. 화면에 그렇게 밝힌다.

핵심 규칙 (외래어 표기법 제2장 표8)
  · 어두의 か行·た行 은 **ㄱ·ㄷ**, 어중·어말은 **ㅋ·ㅌ** … 가 아니라 **ㄲ 아님, 거센소리 아님**
    실제 규칙: 어두 か=가, 어중 か=카. た=다/타.
  · つ = 쓰 (츠 아님)
  · ん = ㄴ 받침, っ = 앞 음절 ㅅ 받침 아니라 다음 자음 겹침 → 받침 처리
  · 장음은 **표기하지 않는다** (ō → 오, ū → 우)
"""

import re

# 어두 / 어중·어말이 다른 것만 두 벌로 둔다
HEAD = {
    "ka": "가", "ki": "기", "ku": "구", "ke": "게", "ko": "고",
    "ta": "다", "chi": "지", "tsu": "쓰", "te": "데", "to": "도",
}
MID = {
    "ka": "카", "ki": "키", "ku": "쿠", "ke": "케", "ko": "코",
    "ta": "타", "chi": "치", "tsu": "쓰", "te": "테", "to": "토",
}
BASE = {
    "a": "아", "i": "이", "u": "우", "e": "에", "o": "오",
    "sa": "사", "shi": "시", "su": "스", "se": "세", "so": "소",
    "na": "나", "ni": "니", "nu": "누", "ne": "네", "no": "노",
    "ha": "하", "hi": "히", "fu": "후", "he": "헤", "ho": "호",
    "ma": "마", "mi": "미", "mu": "무", "me": "메", "mo": "모",
    "ya": "야", "yu": "유", "yo": "요",
    "ra": "라", "ri": "리", "ru": "루", "re": "레", "ro": "로",
    "wa": "와", "wo": "오",
    "ga": "가", "gi": "기", "gu": "구", "ge": "게", "go": "고",
    "za": "자", "ji": "지", "zu": "즈", "ze": "제", "zo": "조",
    "da": "다", "de": "데", "do": "도",
    "ba": "바", "bi": "비", "bu": "부", "be": "베", "bo": "보",
    "pa": "파", "pi": "피", "pu": "푸", "pe": "페", "po": "포",
    "kya": "갸", "kyu": "규", "kyo": "교", "gya": "갸", "gyu": "규", "gyo": "교",
    "sha": "샤", "shu": "슈", "sho": "쇼", "ja": "자", "ju": "주", "jo": "조",
    "cha": "자", "chu": "주", "cho": "조",
    "nya": "냐", "nyu": "뉴", "nyo": "뇨",
    "hya": "햐", "hyu": "휴", "hyo": "효", "bya": "뱌", "byu": "뷰", "byo": "뵤",
    "pya": "퍄", "pyu": "퓨", "pyo": "표", "mya": "먀", "myu": "뮤", "myo": "묘",
    "rya": "랴", "ryu": "류", "ryo": "료",
}
MID_ONLY = {"cha": "차", "chu": "추", "cho": "초"}

# 긴 것부터 맞춰야 한다 — "shi" 를 "s"+"hi" 로 쪼개면 안 된다
SYL = sorted(set(list(BASE) + list(HEAD)), key=len, reverse=True)

# 장음 표기를 없앤다 (ō→o). ⚠️ 규칙상 장음은 적지 않는다.
LONG = str.maketrans("āīūēōâîûêôÂÎÛÊÔĀĪŪĒŌ", "aiueoaiueoAIUEOAIUEO")

# 뒤에 붙는 일반 명사는 한국에서 쓰는 말로 바꾼다
TAIL = [
    (r"\s*beach$", " 해변"), (r"\s*coast$", " 해안"), (r"\s*bay$", " 만"),
    (r"\s*park$", " 공원"), (r"\s*port$", " 항"), (r"\s*island$", " 섬"),
    (r"\s*cape$", " 곶"), (r"\s*river$", " 강"), (r"\s*lake$", " 호"),
    (r"\s*mountain$", " 산"), (r"\s*shrine$", " 신사"), (r"\s*temple$", " 절"),
]


def _word(w):
    """로마자 한 낱말 → 한글. 못 읽는 글자가 나오면 **None** 을 준다(지어내지 않는다)."""
    s = w.lower().translate(LONG)
    s = re.sub(r"[^a-z']", "", s)
    if not s:
        return None
    out, i, first = [], 0, True
    while i < len(s):
        # っ(촉음): 같은 자음이 겹치면 앞 음절에 받침을 넣는다 (kk, tt, pp, ss …)
        if i + 1 < len(s) and s[i] == s[i + 1] and s[i] in "kstpgdbz":
            if out:
                out[-1] = _batchim(out[-1], "ㅅ")
            i += 1
            continue
        # ん: 뒤가 모음이 아니면 앞 음절 ㄴ 받침
        if s[i] == "n" and (i + 1 >= len(s) or s[i + 1] not in "aiueoy"):
            if out:
                out[-1] = _batchim(out[-1], "ㄴ")
            i += 1
            first = False
            continue
        for k in SYL:
            if s.startswith(k, i):
                tbl = (HEAD if first else MID) if k in HEAD else (MID_ONLY if not first and k in MID_ONLY else BASE)
                ch = tbl.get(k) or BASE.get(k)
                if ch is None:
                    return None
                out.append(ch)
                i += len(k)
                first = False
                break
        else:
            return None            # ⚠️ 모르는 조합이면 통째로 포기한다
    return "".join(out)


_JONG = {"ㄴ": 4, "ㅅ": 19}


def _batchim(ch, j):
    """받침 없는 한글 음절에 받침을 넣는다"""
    c = ord(ch) - 0xAC00
    if c < 0 or c > 11171 or c % 28 != 0:
        return ch
    return chr(0xAC00 + c + _JONG.get(j, 0))


def to_hangul(name_en):
    """헵번 로마자/영문 지명 → 한글. 못 읽으면 None."""
    if not name_en:
        return None
    s = name_en.strip()
    tail = ""
    for pat, kr in TAIL:
        m = re.search(pat, s, re.I)
        if m:
            tail = kr
            s = s[:m.start()].strip()
            break
    parts = [p for p in re.split(r"[\s\-]+", s) if p]
    got = []
    for p in parts:
        h = _word(p)
        if h is None:
            return None                # ⚠️ 한 낱말이라도 못 읽으면 **전체를 포기**한다
        got.append(h)
    return ("".join(got) + tail).strip() or None
