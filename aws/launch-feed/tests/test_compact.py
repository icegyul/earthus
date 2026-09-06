"""발사 축약본 — 필드 계약·중계 링크 정리·값을 만들지 않음."""
import importlib.util, os, pathlib, sys, types, unittest
if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3"); boto3.client = lambda *a, **k: object(); sys.modules["boto3"] = boto3
os.environ.setdefault("CACHE_BUCKET", "b")
SPEC = importlib.util.spec_from_file_location("launch_feed", pathlib.Path(__file__).parent.parent / "handler.py")
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)

def rec(**over):
    base = {
        "id": "abc", "name": "Falcon 9 Block 5 | Starlink 12-3", "net": "2026-09-10T15:37:00Z",
        "status": {"name": "Go for Launch", "abbrev": "Go", "description": "Confirmed."},
        "launch_service_provider": {"name": "SpaceX", "type": "Commercial"},
        "rocket": {"configuration": {"full_name": "Falcon 9 Block 5", "family": "Falcon", "description": "x" * 900}},
        "mission": {"name": "Starlink 12-3", "type": "Communications", "description": "d" * 1200,
                    "orbit": {"name": "Low Earth Orbit", "abbrev": "LEO"}, "vid_urls": [], "info_urls": []},
        "pad": {"name": "SLC-4E", "latitude": "34.632", "longitude": "-120.611", "wiki_url": "https://w",
                "location": {"name": "Vandenberg SFB", "country_code": "USA"}},
        "vidURLs": [
            {"priority": 12, "publisher": "NASA", "title": "second", "url": "https://plus.nasa.gov/x", "source": "plus.nasa.gov",
             "type": {"name": "Official Webcast"}, "language": {"code": "en"}},
            {"priority": 10, "publisher": "SpaceX", "title": "first", "url": "https://www.youtube.com/watch?v=abc",
             "source": "youtube.com", "type": {"name": "Official Webcast"}, "start_time": "2026-09-10T15:25:00Z",
             "description": "e" * 500, "feature_image": "https://img"},
            {"priority": 11, "publisher": "dup", "title": "dup", "url": "https://www.youtube.com/watch?v=abc"},
            {"priority": 13, "publisher": "bad", "title": "http", "url": "http://insecure"},
        ],
        "infoURLs": [{"title": "SpaceX", "url": "https://spacex.com"}],
        "webcast_live": False, "image": "https://img", "url": "https://ll/launch/abc/",
    }
    base.update(over); return base

class CompactTest(unittest.TestCase):
    def test_fields_and_limits(self):
        c = M.compact(rec())
        self.assertEqual((c["id"], c["provider"], c["rocket"], c["pad"]), ("abc", "SpaceX", "Falcon 9 Block 5", "SLC-4E"))
        self.assertEqual((c["lat"], c["lon"]), (34.632, -120.611))
        self.assertEqual(c["orbitAbbrev"], "LEO")
        self.assertEqual(len(c["missionDescription"]), 900)          # 잘라도 값은 원본 그대로
        self.assertNotIn("image", c)                                  # 제3자 라이선스 — 싣지 않는다
        self.assertNotIn("rocketDescription", c)
    def test_videos_sorted_deduped_https_only(self):
        v = M.compact(rec())["videos"]
        self.assertEqual([x["publisher"] for x in v], ["SpaceX", "NASA"])   # priority 순
        self.assertEqual(v[0]["source"], "youtube.com")
        self.assertEqual(v[0]["start_time"], "2026-09-10T15:25:00Z")
        self.assertEqual(v[0]["kind"], "Official Webcast")
        self.assertEqual(len(v[0]["description"]), 300)
        self.assertNotIn("feature_image", v[0])
        self.assertTrue(all(x["url"].startswith("https://") for x in v))
    def test_no_pad_coords_dropped(self):
        self.assertIsNone(M.compact(rec(pad={"name": "x", "location": {}})))
    def test_empty_fields_removed_not_invented(self):
        c = M.compact(rec(mission={"name": None, "type": None, "description": "", "orbit": {}}, vidURLs=[], infoURLs=[]))
        for k in ("mission", "missionDescription", "orbit", "orbitAbbrev", "videos", "links"):
            self.assertNotIn(k, c, k)

if __name__ == "__main__": unittest.main()
