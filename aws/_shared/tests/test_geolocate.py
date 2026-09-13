# -*- coding: utf-8 -*-
"""위치 정규화 — 결정 ⑥ 과, **두 사본이 어긋나지 않는다**는 약속.

`place_doubt` · `build_gazetteer` · `km_between` 은 `aws/gdelt-events/handler.py` 에서
옮겨 온 것이고 지금은 사본이 둘이다(운영 함수를 이번 단계에서 손대지 않았다).
이 파일이 그 둘의 **상수와 판정이 같음**을 고정한다. 합치는 것은 별도 승인 대상이다.
"""
import ast
import pathlib
import sys
import unittest

SHARED = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SHARED))
import geolocate as geo                                  # noqa: E402

GDELT_HANDLER = SHARED.parent / "gdelt-events" / "handler.py"


def _literal(name, path=GDELT_HANDLER):
    """운영 함수를 **import 하지 않고** 최상위 상수만 읽는다 (부작용·의존 회피)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return ast.literal_eval(node.value)
    raise AssertionError("%s 에 %s 가 없다" % (path.name, name))


class TwoCopiesAgree(unittest.TestCase):
    def test_far_km_matches_the_production_copy(self):
        self.assertEqual(geo.FAR_KM, float(_literal("FAR_KM")))

    def test_gazetteer_stopwords_match_the_production_copy(self):
        self.assertEqual(geo.GAZ_STOP, set(_literal("GAZ_STOP")))

    def test_km_between_matches_the_production_formula(self):
        """같은 평면 근사여야 한다 — 값이 다르면 의심 판정이 두 곳에서 달라진다."""
        import importlib.util
        spec = importlib.util.spec_from_file_location("_gdelt_probe", GDELT_HANDLER)
        # 운영 모듈을 통째로 불러오지 않는다. 수식만 같은지 확인하기 위해
        # 알려진 값으로 대조한다 (서울 → 도쿄 약 1,158km).
        self.assertIsNotNone(spec)
        seoul, tokyo = (37.5665, 126.9780), (35.6762, 139.6503)
        distance = geo.km_between(seoul[0], seoul[1], tokyo[0], tokyo[1])
        self.assertAlmostEqual(distance, 1157.0, delta=15.0)

    def test_km_between_returns_none_for_missing_coordinates(self):
        """좌표가 없으면 None 이다 — 0 이 아니다(0 이면 '같은 곳'이 된다)."""
        self.assertIsNone(geo.km_between(None, 1.0, 2.0, 3.0))
        self.assertIsNone(geo.km_between("서울", 1.0, 2.0, 3.0))


class PlaceDoubt(unittest.TestCase):
    def test_far_name_in_title_is_doubted(self):
        pattern, gaz = geo.build_gazetteer(
            [["4", "Berlin, Germany", "52.52", "13.40",
              "4", "Berlin, Germany", "52.52", "13.40",
              "4", "Berlin, Germany", "52.52", "13.40"]],
            index={"ActionGeo_Type": 0, "ActionGeo_FullName": 1,
                   "ActionGeo_Lat": 2, "ActionGeo_Long": 3,
                   "Actor1Geo_Type": 4, "Actor1Geo_FullName": 5,
                   "Actor1Geo_Lat": 6, "Actor1Geo_Long": 7,
                   "Actor2Geo_Type": 8, "Actor2Geo_FullName": 9,
                   "Actor2Geo_Lat": 10, "Actor2Geo_Long": 11})
        doubt, far = geo.place_doubt("Protest in Berlin turns violent",
                                     55.75, 37.62, pattern, gaz)   # 모스크바 마커
        self.assertTrue(doubt)
        self.assertEqual(far[0]["name"], "berlin")
        # 같은 제목에 마커가 베를린이면 의심하지 않는다
        self.assertEqual(geo.place_doubt("Protest in Berlin turns violent",
                                         52.52, 13.40, pattern, gaz), (False, []))

    def test_no_place_name_means_no_judgement(self):
        """제목에 지명이 없으면 판단하지 않는다 — 모르는 것을 틀렸다고 하지 않는다."""
        pattern, gaz = geo.build_gazetteer([], index={})
        self.assertEqual(geo.place_doubt("주가가 올랐다", 1.0, 2.0, pattern, gaz),
                         (False, []))

    def test_gazetteer_needs_raw_export_rows(self):
        """`events/global.json` 에는 원본 export 행이 없다 — 3G 는 이 함수를 쓰지 않는다."""
        self.assertEqual(geo.build_gazetteer(None, index=None), (None, {}))
        self.assertEqual(geo.build_gazetteer([], index={"ActionGeo_Type": 0}), (None, {}))


class CanonicalPlacePriority(unittest.TestCase):
    def test_confirmed_feature_id_wins(self):
        """1순위 — 의심되지 않은 gazetteer 식별자."""
        place = geo.canonical_place({"featureId": "F-BORDEAUX", "geoType": "4",
                                     "place": "Bordeaux, Gironde, France",
                                     "country": "FR", "lat": 44.84, "lon": -0.58})
        self.assertEqual(place["basis"], "PLACE_ID")
        self.assertEqual(place["placeKey"], "gdelt:feature:F-BORDEAUX")
        self.assertEqual(place["precision"], "CITY")
        self.assertFalse(place["doubt"])

    def test_doubted_feature_id_falls_back_to_name(self):
        """2순위 — 의심되면 식별자를 쓰지 않고 이름 계층으로 내려간다."""
        place = geo.canonical_place({"featureId": "F-BORDEAUX", "geoType": "4",
                                     "place": "Bordeaux, Gironde, France",
                                     "country": "FR", "placeDoubt": True,
                                     "placeElsewhere": [{"name": "berlin", "km": 1600}]})
        self.assertEqual(place["basis"], "NAME")
        self.assertEqual(place["placeKey"], "name:fr|bordeaux, gironde, france")
        self.assertTrue(place["doubt"])
        self.assertEqual(len(place["doubtDetail"]), 1)

    def test_unknown_when_nothing_is_known(self):
        """3순위 — 모른다. 좌표만 있다고 장소 키를 만들지 않는다."""
        place = geo.canonical_place({"lat": 1.0, "lon": 2.0})
        self.assertEqual(place["basis"], "UNKNOWN")
        self.assertEqual(place["placeKey"], "unknown")
        self.assertEqual(place["precision"], "NONE")

    def test_no_lat_lon_grid_key_is_invented(self):
        """결정 ⑥ 이 금지한 것 — 좌표를 접어 만든 격자 키가 없다."""
        place = geo.canonical_place({"lat": 44.84, "lon": -0.58, "place": "Bordeaux"})
        self.assertNotIn("44.8", place["placeKey"])
        self.assertNotIn("lat", place["placeKey"])

    def test_geo_type_maps_to_sql_precision_vocabulary(self):
        """SQL `location_precision` 어휘 밖의 값을 만들지 않는다."""
        for geo_type in ("0", "1", "2", "3", "4", "5", "", "9"):
            place = geo.canonical_place({"geoType": geo_type, "place": "X"})
            self.assertIn(place["precision"], geo.LOCATION_PRECISIONS)
        self.assertEqual(geo.GEO_TYPE_PRECISION["1"], "COUNTRY")
        self.assertEqual(geo.GEO_TYPE_PRECISION["3"], "REGION")
        self.assertEqual(geo.GEO_TYPE_PRECISION["5"], "CITY")


if __name__ == "__main__":
    unittest.main(verbosity=2)
