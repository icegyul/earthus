import unittest

from safety_contract import command_state, latest_by_region_kind


class SafetyContractTest(unittest.TestCase):
    def test_official_command_codes(self):
        self.assertEqual(command_state("1"), "PUBLISHED")
        self.assertEqual(command_state("2"), "REPLACED")
        self.assertEqual(command_state("3"), "RELEASED")
        self.assertEqual(command_state("4"), "RELEASE_FORECAST_EXTENDED")

    def test_korean_commands_do_not_confuse_extension_with_release(self):
        self.assertEqual(command_state("해제"), "RELEASED")
        self.assertEqual(command_state("해제예보 연장"), "RELEASE_FORECAST_EXTENDED")
        self.assertEqual(command_state("해제예고 연장"), "RELEASE_FORECAST_EXTENDED")

    def test_unknown_is_preserved(self):
        self.assertEqual(command_state("새명령"), "UNKNOWN")
        self.assertEqual(command_state(""), "UNKNOWN")

    def test_publish_replace_release_replay(self):
        rows = [
            {"reg_id": "A", "wrn": "호우", "tm_fc": "202608121100", "cmd": "3"},
            {"reg_id": "A", "wrn": "호우", "tm_fc": "202608120900", "cmd": "1"},
            {"reg_id": "A", "wrn": "호우", "tm_fc": "202608121000", "cmd": "2"},
            {"reg_id": "A", "wrn": "호우", "tm_fc": "202608121100", "cmd": "3"},
        ]
        latest = latest_by_region_kind(rows)
        self.assertEqual(len(latest), 1)
        self.assertEqual(command_state(latest[("A", "호우")]["cmd"]), "RELEASED")

    def test_region_and_kind_are_independent(self):
        rows = [
            {"reg_id": "A", "wrn": "호우", "tm_fc": "202608120900", "cmd": "1"},
            {"reg_id": "A", "wrn": "강풍", "tm_fc": "202608121000", "cmd": "1"},
            {"reg_id": "B", "wrn": "호우", "tm_fc": "202608121100", "cmd": "1"},
        ]
        self.assertEqual(len(latest_by_region_kind(rows)), 3)


if __name__ == "__main__":
    unittest.main()
