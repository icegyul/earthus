import importlib.util
import pathlib
import unittest
from datetime import datetime, timezone


PATH = pathlib.Path(__file__).parents[1] / "handler.py"
SPEC = importlib.util.spec_from_file_location("tokyo_vaac_handler", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


LIST_HTML = """
<table><tr class="mtx"><td style="DISPLAY:none">2026/08/11 03:23:00</td>
<td>03:23 UTC</td><td>SAKURAJIMA (AIRA CALDERA)</td><td>JAPAN</td><td>2026/148</td>
<td><a href="TextData/2026/item.html">Text</a></td><td>-</td></tr></table>
"""

TEXT_HTML = """
<html><body><p>VA ADVISORY<br>
DTG: 20260811/0323Z<br>
VAAC: TOKYO<br>
VOLCANO: SAKURAJIMA (AIRA CALDERA) 282080<br>
PSN: N3136 E13039<br>
AREA: JAPAN<br>
SOURCE ELEV: 1117M AMSL<br>
ADVISORY NR: 2026/148<br>
INFO SOURCE: JMA HIMAWARI-9<br>
ERUPTION DETAILS: ERUPTED AT 20260811/0303Z FL080 EXTD SW<br>
OBS VA DTG: 11/0300Z<br>
OBS VA CLD: SFC/FL080 N3136 E13039 - N3100 E13000 MOV SW 8KT<br>
FCST VA CLD +6 HR: 11/0900Z SFC/FL080 N3100 E13000 - N3000 E12900<br>
FCST VA CLD +12 HR: NOT AVBL<br>
FCST VA CLD +18 HR: NO VA EXP<br>
RMK: TEST<br>
NXT ADVISORY: NO FURTHER ADVISORIES=</p></body></html>
"""


class TokyoVaacTest(unittest.TestCase):
    def test_list_and_text_parse(self):
        seeds = MODULE.parse_list(LIST_HTML)
        self.assertEqual(len(seeds), 1)
        item = MODULE.parse_advisory(TEXT_HTML, seeds[0])
        self.assertEqual(item["volcanoNumber"], "282080")
        self.assertEqual(item["position"], {"lat": 31.6, "lon": 130.65})
        self.assertEqual(item["observedAt"], "2026-08-11T03:00:00Z")
        self.assertEqual(len(item["observation"]["polygon"]), 2)
        self.assertEqual(item["observation"]["movement"], {"direction": "SW", "speedKt": 8})
        self.assertTrue(item["forecasts"][0]["available"])
        self.assertFalse(item["forecasts"][1]["available"])
        self.assertTrue(item["closedByIssuer"])

    def test_build_reuses_previous_and_does_not_refetch(self):
        calls = []

        def fake_fetch(url):
            calls.append(url)
            return TEXT_HTML

        first = MODULE.build(
            now=datetime(2026, 8, 11, 4, tzinfo=timezone.utc),
            list_document=LIST_HTML,
            fetch=fake_fetch,
        )
        self.assertEqual(first["newCount"], 1)
        second = MODULE.build(
            now=datetime(2026, 8, 11, 5, tzinfo=timezone.utc),
            list_document=LIST_HTML,
            fetch=fake_fetch,
            previous=first,
        )
        self.assertEqual(second["newCount"], 0)
        self.assertEqual(len(calls), 1)
        self.assertEqual(first["contentHash"], second["contentHash"])

    def test_not_identifiable_never_becomes_a_track(self):
        seed = MODULE.parse_list(LIST_HTML)[0]
        text = TEXT_HTML.replace(
            "SFC/FL080 N3136 E13039 - N3100 E13000 MOV SW 8KT",
            "VA NOT IDENTIFIABLE FM SATELLITE DATA WIND FL080 360/8KT",
        )
        item = MODULE.parse_advisory(text, seed)
        self.assertEqual(item["observation"]["state"], "NOT_IDENTIFIABLE")
        self.assertEqual(item["observation"]["polygon"], [])


if __name__ == "__main__":
    unittest.main()
