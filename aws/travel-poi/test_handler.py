# -*- coding: utf-8 -*-
"""travel-poi 시험 — Overpass 도 S3 도 부르지 않는다.

결과로 시험한다: 칸 파일에 **이름 있는 장소가 나와야** 하고, OSM 출처가 **실려 있어야** 하고,
실패한 칸은 **옛 파일이 남아 있어야** 한다.
"""
import importlib.util
import json
import pathlib
import sys
import unittest
from urllib.error import HTTPError

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("travel_poi_handler", HERE / "handler.py")
H = importlib.util.module_from_spec(spec)
sys.modules["travel_poi_handler"] = H
spec.loader.exec_module(H)


class FakeStore:
    def __init__(self, index=None, files=None):
        self.files = dict(files or {})
        if index is not None:
            self.files[f"{H.PREFIX}/index.json"] = index
        self.puts = []

    def get_json(self, key):
        return self.files.get(key)

    def put_json(self, key, doc, cache="x"):
        self.puts.append(key)
        self.files[key] = json.loads(json.dumps(doc))
        return 1


def node(i, lat, lon, **tags):
    return {"type": "node", "id": i, "lat": lat, "lon": lon, "tags": tags}


SEOUL_TILE = {"key": "n35_e125", "s": 35, "w": 125, "n": 40, "e": 130, "iso": "KR"}


class Tiles(unittest.TestCase):
    def test_market_priority_order_and_no_duplicates(self):
        tiles = H.coverage_tiles()
        keys = [t["key"] for t in tiles]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(tiles[0]["iso"], "KR")                   # 한국 먼저
        self.assertIn("n35_e125", keys)                           # 서울
        self.assertIn("n30_e125", keys)                           # 제주
        self.assertIn("n35_e135", keys)                           # 오사카·교토
        self.assertIn("n50_w5", keys)                             # 런던(51.5N, 0.1W)
        self.assertIn("n55_w10", keys)                            # 스코틀랜드 서부
        self.assertIn("n40_w75", keys)                            # 뉴욕
        self.assertLess(len(tiles), 160)                          # 하루 한 번·12분 예산이면 첫 바퀴는 1~2주(칸당 10~60초)

    def test_negative_coordinates_name_west_and_south(self):
        self.assertEqual(H.tile_key(-5, -80), "s5_w80")
        self.assertEqual(H.tile_key(35, 125), "n35_e125")


class Normalize(unittest.TestCase):
    def test_named_nodes_inside_the_tile_with_the_travel_js_kinds(self):
        els = [
            node(1, 37.57, 126.98, tourism="museum", name="국립중앙박물관", **{"name:en": "National Museum", "wikidata": "Q1"}),
            node(2, 37.5, 127.0, man_made="observatory", name="천문대"),
            node(3, 37.5, 127.0, amenity="planetarium", name="천문관"),
            node(4, 37.5, 127.0, tourism="attraction"),                        # 이름 없음 → 버림
            node(5, 40.0, 127.0, tourism="zoo", name="경계 북쪽"),              # [s, n) 밖 → 이웃 칸 몫
            {"type": "way", "id": 6, "tags": {"tourism": "museum", "name": "way"}},
        ]
        items = H.normalize(els, SEOUL_TILE)
        self.assertEqual([it["id"] for it in items], [1, 2, 3])
        self.assertEqual(items[0]["k"], "museum")
        self.assertEqual(items[0]["ne"], "National Museum")
        self.assertEqual(items[0]["w"], 1)
        self.assertEqual(items[1]["k"], "observatory")
        self.assertEqual(items[2]["k"], "planetarium")

    def test_cap_keeps_linked_places_then_rare_kinds_first(self):
        items = [{"id": i, "n": str(i), "la": 37.0, "lo": 127.0, "k": "attraction"} for i in range(500)]
        items.append({"id": 9999, "n": "obs", "la": 37.0, "lo": 127.0, "k": "observatory"})
        items.append({"id": 9998, "n": "linked", "la": 37.0, "lo": 127.0, "k": "attraction", "w": 1})
        doc = H.tile_document(SEOUL_TILE, items, "2026-09-24T00:00:00Z")
        self.assertEqual(doc["count"], H.TILE_CAP)
        self.assertEqual(doc["total"], 502)
        self.assertTrue(doc["capped"])
        self.assertEqual(doc["items"][0]["id"], 9998)          # 위키 연결 먼저
        self.assertEqual(doc["items"][1]["id"], 9999)          # 그다음 드문 종류
        self.assertEqual(doc["attribution"], "© OpenStreetMap contributors")
        self.assertEqual(doc["license"], "ODbL-1.0")

    def test_query_is_a_bbox_query_for_the_three_tag_families(self):
        q = H.overpass_query(SEOUL_TILE)
        self.assertIn("(35,125,40,130)", q)
        self.assertIn('tourism"~"^(museum|aquarium|zoo|attraction)$"', q)
        self.assertIn('amenity"="planetarium"', q)
        self.assertIn('man_made"="observatory"', q)


class Run(unittest.TestCase):
    def fetch_ok(self, query):
        if "(35,125,40,130)" in query:
            return {"elements": [node(1, 37.57, 126.98, tourism="museum", name="박물관")]}
        return {"elements": []}

    def run_it(self, store, fetch, ticks=None):
        clock = iter(ticks or [0] * 10_000)
        return H.run(store, fetch=fetch, clock=lambda: next(clock), sleep=lambda s: None,
                     now=lambda: "2026-09-24T19:10:00Z")

    def test_places_and_attribution_come_out(self):
        store = FakeStore()
        out = self.run_it(store, self.fetch_ok)
        self.assertEqual(out["failed"], 0)
        tile = store.files[f"{H.PREFIX}/tiles/n35_e125.json"]
        self.assertEqual(tile["items"][0]["n"], "박물관")
        index = store.files[f"{H.PREFIX}/index.json"]
        self.assertEqual(index["attribution"], "© OpenStreetMap contributors")
        self.assertEqual(index["tiles"]["n35_e125"]["count"], 1)
        self.assertEqual(index["tiles"]["n30_e120"]["count"], 0)
        self.assertEqual({c["iso"] for c in index["coverage"]}, {"KR", "JP", "TW", "GB", "US"})
        # 빈 칸(바다)은 파일을 만들지 않는다 — 브라우저는 count 0 인 칸을 받지 않는다
        self.assertNotIn(f"{H.PREFIX}/tiles/n30_e120.json", store.files)

    def test_failed_tile_keeps_the_old_file_and_old_count(self):
        old_tile = {"items": [{"id": 7, "n": "옛 박물관"}], "count": 1}
        old_index = {"tiles": {"n35_e125": {"count": 1, "fetchedAt": "2026-09-20T00:00:00Z"}}}
        store = FakeStore(index=old_index, files={f"{H.PREFIX}/tiles/n35_e125.json": old_tile})

        def fetch(query):
            if "(35,125,40,130)" in query:
                raise HTTPError("u", 504, "Gateway Timeout", {}, None)
            return {"elements": []}

        self.run_it(store, fetch)
        self.assertEqual(store.files[f"{H.PREFIX}/tiles/n35_e125.json"], old_tile)
        self.assertNotIn(f"{H.PREFIX}/tiles/n35_e125.json", store.puts)
        st = store.files[f"{H.PREFIX}/index.json"]["tiles"]["n35_e125"]
        self.assertEqual(st["count"], 1)
        self.assertEqual(st["fetchedAt"], "2026-09-20T00:00:00Z")
        self.assertIn("HTTPError", st["lastError"])

    def test_overpass_runtime_remark_is_a_failure_not_an_empty_tile(self):
        old_tile = {"items": [{"id": 7}], "count": 1}
        store = FakeStore(index={"tiles": {"n35_e125": {"count": 1, "fetchedAt": "2026-09-20T00:00:00Z"}}},
                          files={f"{H.PREFIX}/tiles/n35_e125.json": old_tile})

        def fetch(query):
            if "(35,125,40,130)" in query:
                return {"elements": [], "remark": "runtime error: Query timed out"}
            return {"elements": []}

        self.run_it(store, fetch)
        self.assertEqual(store.files[f"{H.PREFIX}/index.json"]["tiles"]["n35_e125"]["count"], 1)

    def test_stalest_tile_goes_first_and_budget_stops_the_run(self):
        tiles = H.coverage_tiles()
        fresh = {t["key"]: {"fetchedAt": "2026-09-24T00:00:00Z"} for t in tiles}
        fresh["n40_w75"]["fetchedAt"] = "2026-09-01T00:00:00Z"        # 뉴욕 칸이 가장 오래됐다
        order = H.plan_order(tiles, fresh)
        self.assertEqual(order[0]["key"], "n40_w75")

        seen = []

        def fetch(query):
            seen.append(query)
            return {"elements": []}

        store = FakeStore(index={"tiles": fresh})
        out = self.run_it(store, fetch, ticks=[0, 0, 0, H.BUDGET_S + 1] + [H.BUDGET_S + 1] * 1000)
        self.assertEqual(out["stopped"], "BUDGET")
        self.assertEqual(len(seen), 2)
        self.assertIn("(40,-75,45,-70)", seen[0])

    def test_a_failed_tile_goes_to_the_back_instead_of_blocking_every_day(self):
        tiles = H.coverage_tiles()
        state = {t["key"]: {"fetchedAt": "2026-09-23T19:10:00Z"} for t in tiles}
        # 어제 실패한 무거운 칸 — fetchedAt 은 비었고 시도 시각만 있다
        state["n40_w75"] = {"fetchedAt": None, "lastTriedAt": "2026-09-24T19:10:00Z"}
        order = [t["key"] for t in H.plan_order(tiles, state)]
        self.assertEqual(order[-1], "n40_w75")
        # 한 번도 시도하지 않은 칸은 여전히 맨 앞이다
        state["n35_e125"] = {"fetchedAt": None}
        self.assertEqual(H.plan_order(tiles, state)[0]["key"], "n35_e125")

    def test_once_fetched_tiles_that_start_failing_do_not_starve_the_rest(self):
        # (2026-09-24 검수) 한 번 받은 칸이 나중에 504 를 내기 시작하면 fetchedAt 은 옛 날짜로 남는다.
        #   예전 순서 규칙(fetchedAt or lastTriedAt)은 그 칸들을 매일 맨 앞에 세웠고, 셋이 연달아 실패하면
        #   그날 run 이 OVERPASS_REFUSING 으로 멈춰 **다른 칸은 하나도 돌지 않았다.** 이틀째에 나머지가 돌아야 한다.
        tiles = H.coverage_tiles()
        heavy = {"n40_w75", "n30_w120", "n35_w120"}                    # 뉴욕·LA 칸
        state = {t["key"]: {"fetchedAt": "2026-09-22T19:10:00Z"} for t in tiles}
        for k in heavy:
            state[k] = {"fetchedAt": "2026-09-01T00:00:00Z", "count": 400}
        calls = []

        def fetch(query):
            calls.append(query)
            if any(f"({t['s']},{t['w']},{t['n']},{t['e']})" in query for t in tiles if t["key"] in heavy):
                raise HTTPError("u", 504, "Gateway Timeout", {}, None)
            return {"elements": []}

        store = FakeStore(index={"tiles": state})
        day1 = self.run_it(store, fetch)
        self.assertEqual(day1["stopped"], "OVERPASS_REFUSING")        # 첫날은 무거운 칸 셋에 막힌다
        self.assertEqual(day1["done"], 0)
        # 이튿날 — 같은 색인으로 다시 돈다. 무거운 칸은 이제 '어제 시도한 칸'이라 뒤로 간다.
        order = [t["key"] for t in H.plan_order(tiles, store.files[f"{H.PREFIX}/index.json"]["tiles"])]
        self.assertEqual(set(order[-3:]), heavy)
        calls.clear()
        day2 = H.run(store, fetch=fetch, clock=iter([0] * 10_000).__next__, sleep=lambda s: None,
                     now=lambda: "2026-09-25T19:10:00Z")
        self.assertGreater(day2["done"], 0)
        # 옛 칸 파일·옛 count 는 실패해도 그대로다
        self.assertEqual(store.files[f"{H.PREFIX}/index.json"]["tiles"]["n40_w75"]["count"], 400)

    def test_public_server_refusing_stops_the_run_early(self):
        calls = []

        def fetch(query):
            calls.append(query)
            raise HTTPError("u", 429, "Too Many Requests", {}, None)

        out = self.run_it(FakeStore(), fetch)
        self.assertEqual(out["stopped"], "OVERPASS_REFUSING")
        self.assertEqual(len(calls), H.MAX_CONSECUTIVE_FAILS)


class Schedule(unittest.TestCase):
    def test_daily_schedule_line_exists_once(self):
        text = (HERE.parent / "schedules.sh").read_text(encoding="utf-8")
        lines = [ln for ln in text.splitlines() if ln.strip().startswith('"travel-poi|')]
        self.assertEqual(len(lines), 1)
        self.assertIn("cron(", lines[0])


if __name__ == "__main__":
    unittest.main()
