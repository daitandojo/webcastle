#!/usr/bin/env python3
"""
Comprehensive test for Scraping Service API
Tests various sources, modes, and edge cases
"""

import requests
import json
import time
import sys
import random
from typing import List, Dict, Any


def add_cache_buster(url: str) -> str:
    """Add random query parameter to bypass cache"""
    separator = "&" if "?" in url else "?"
    random_val = f"{int(time.time() * 1000)}_{random.randint(0, 1000000)}"
    return f"{url}{separator}cache_buster={random_val}"


BASE_URL = "http://localhost:3052"
API_KEY = "scraping-key-1"

headers = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
}

# Test sources - variety of websites with different characteristics
TEST_SOURCES = [
    # Simple static sites
    {"url": "https://example.com", "name": "Example (simple static)"},
    {"url": "https://httpbin.org/html", "name": "HTTPBin (test page)"},
    # News/media sites (often complex, ads, JavaScript)
    {"url": "https://www.bbc.com/news", "name": "BBC News (complex media)"},
    {"url": "https://www.reuters.com", "name": "Reuters (news)"},
    # E-commerce (JavaScript heavy)
    {"url": "https://www.amazon.com", "name": "Amazon (e-commerce)"},
    # Documentation/tech
    {"url": "https://docs.python.org/3/", "name": "Python Docs (documentation)"},
    # Social media
    {"url": "https://twitter.com", "name": "Twitter (social media)"},
    # Government/institutional
    {"url": "https://www.gov.uk", "name": "UK Government (institutional)"},
    # Non-English
    {"url": "https://www.borsen.dk", "name": "Børsen (Danish financial)"},
    {"url": "https://www.spiegel.de", "name": "Spiegel (German news)"},
    # Blogs/forums
    {"url": "https://medium.com", "name": "Medium (blogging platform)"},
]

# Test modes
MODES = [
    "CLEAN_TEXT",
    "FULL_HTML",
    "HYPERLINKS",
    "METADATA",
    "IMAGE_HUNT",
]

# Fidelity modes
FIDELITIES = ["FAST", "DEEP"]


def test_health():
    """Test health endpoint"""
    print("Testing health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        data = response.json()
        assert data["status"] == "healthy"
        print(f"✓ Health OK: {data['status']}")
        return True
    except Exception as e:
        print(f"✗ Health failed: {e}")
        return False


def test_capabilities():
    """Test capabilities endpoint"""
    print("Testing capabilities endpoint...")
    try:
        response = requests.get(
            f"{BASE_URL}/v1/capabilities", headers=headers, timeout=10
        )
        data = response.json()
        assert "capabilities" in data
        assert "supportedModes" in data
        print(f"✓ Capabilities OK: {len(data['supportedModes'])} modes supported")
        return True
    except Exception as e:
        print(f"✗ Capabilities failed: {e}")
        return False


def test_single_scrape(url: str, mode: str, fidelity: str, source_name: str) -> bool:
    """Test single URL scraping with specific mode and fidelity"""
    print(f"  Testing {mode} with {fidelity} fidelity...")

    payload = {"url": url, "mode": mode, "fidelity": fidelity, "options": {}}

    # Add mode-specific options
    if mode == "HYPERLINKS":
        payload["options"]["limit"] = 10
    elif mode == "IMAGE_HUNT":
        payload["options"]["limit"] = 5

    try:
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/v1/scrape",
            headers=headers,
            json=payload,
            timeout=30 if fidelity == "FAST" else 60,
        )
        elapsed = time.time() - start_time

        if response.status_code != 200:
            print(f"    ✗ HTTP {response.status_code}: {response.text[:200]}")
            return False

        data = response.json()

        if not data.get("success"):
            error = data.get("error", {})
            print(f"    ✗ Scrape failed: {error.get('message', 'Unknown error')}")
            return False

        result = data["data"]

        # Validate response structure
        assert "success" in result
        assert "url" in result
        assert "content" in result or "structuredData" in result

        # Mode-specific validation
        if mode == "HYPERLINKS":
            assert "structuredData" in result
            assert "hyperlinks" in result["structuredData"]
            links = result["structuredData"]["hyperlinks"]
            print(f"    ✓ Found {len(links)} hyperlinks")

        elif mode == "METADATA":
            assert "structuredData" in result
            assert "metadata" in result["structuredData"]
            meta = result["structuredData"]["metadata"]
            print(f"    ✓ Found {len(meta)} metadata items")

        elif mode == "IMAGE_HUNT":
            assert "structuredData" in result
            assert "images" in result["structuredData"]
            images = result["structuredData"]["images"]
            print(f"    ✓ Found {len(images)} images")

        elif mode == "CLEAN_TEXT":
            content = result.get("content", "")
            print(f"    ✓ Extracted {len(content)} characters")

        elif mode == "FULL_HTML":
            content = result.get("content", "")
            print(f"    ✓ Extracted {len(content)} characters of HTML")

        print(f"    ✓ Success in {elapsed:.2f}s")
        return True

    except Exception as e:
        print(f"    ✗ Error: {e}")
        return False


def test_hyperlinks_endpoint(url: str, source_name: str):
    """Test dedicated hyperlinks endpoint with filtering"""
    print(f"  Testing hyperlinks endpoint with filters...")

    tests = [
        {"name": "default", "options": {}},
        {"name": "limit=5", "options": {"limit": 5}},
        {"name": "internal only", "options": {"includeExternal": False}},
        {"name": "external only", "options": {"includeInternal": False}},
    ]

    all_passed = True
    for test in tests:
        print(f"    Testing {test['name']}...")
        payload = {"url": url, "fidelity": "FAST", "options": test["options"]}

        try:
            response = requests.post(
                f"{BASE_URL}/v1/scrape/links", headers=headers, json=payload, timeout=30
            )

            if response.status_code != 200:
                print(f"      ✗ HTTP {response.status_code}")
                all_passed = False
                continue

            data = response.json()
            if not data.get("success"):
                print(
                    f"      ✗ Failed: {data.get('error', {}).get('message', 'Unknown')}"
                )
                all_passed = False
                continue

            links = data["data"]["structuredData"]["hyperlinks"]
            print(f"      ✓ Found {len(links)} links")

        except Exception as e:
            print(f"      ✗ Error: {e}")
            all_passed = False

    return all_passed


def test_batch_scrape():
    """Test batch scraping with multiple URLs and modes"""
    print("Testing batch scraping...")

    batch_urls = [
        {"url": "https://example.com", "mode": "CLEAN_TEXT", "fidelity": "FAST"},
        {"url": "https://example.com", "mode": "HYPERLINKS", "fidelity": "FAST"},
        {"url": "https://example.com", "mode": "METADATA", "fidelity": "FAST"},
    ]

    payload = {"urls": batch_urls, "options": {"parallel": 2}}

    try:
        response = requests.post(
            f"{BASE_URL}/v1/scrape/batch", headers=headers, json=payload, timeout=60
        )

        if response.status_code != 200:
            print(f"✗ Batch HTTP {response.status_code}")
            return False

        data = response.json()
        if not data.get("success"):
            print(f"✗ Batch failed: {data.get('error', {}).get('message', 'Unknown')}")
            return False

        results = data.get("data", [])
        print(f"✓ Batch processed {len(results)} URLs")

        success_count = sum(1 for r in results if r.get("success"))
        print(f"  {success_count}/{len(results)} successful")

        return success_count == len(results)

    except Exception as e:
        print(f"✗ Batch error: {e}")
        return False


def test_error_handling():
    """Test error handling for invalid requests"""
    print("Testing error handling...")

    error_tests = [
        {"name": "invalid URL", "payload": {"url": "not-a-url", "mode": "CLEAN_TEXT"}},
        {
            "name": "non-existent domain",
            "payload": {
                "url": "https://non-existent-domain-12345.com",
                "mode": "CLEAN_TEXT",
            },
        },
        {
            "name": "invalid mode",
            "payload": {"url": "https://example.com", "mode": "INVALID_MODE"},
        },
        {
            "name": "missing API key",
            "payload": {"url": "https://example.com", "mode": "CLEAN_TEXT"},
            "no_key": True,
        },
    ]

    all_passed = True
    for test in error_tests:
        print(f"  Testing {test['name']}...")

        test_headers = {} if test.get("no_key") else headers
        payload = test["payload"]

        try:
            response = requests.post(
                f"{BASE_URL}/v1/scrape", headers=test_headers, json=payload, timeout=30
            )

            # Should get error response
            data = response.json()

            if test.get("no_key"):
                if (
                    response.status_code == 401
                    or data.get("error", {}).get("code") == "MISSING_API_KEY"
                ):
                    print(f"    ✓ Correctly rejected (no API key)")
                else:
                    print(f"    ✗ Expected auth error, got: {response.status_code}")
                    all_passed = False
            else:
                if not data.get("success") and "error" in data:
                    print(
                        f"    ✓ Correct error: {data['error'].get('code', 'Unknown')}"
                    )
                else:
                    # Check if scrape failed (inner data.success false)
                    if (
                        data.get("success")
                        and data.get("data")
                        and not data["data"].get("success")
                    ):
                        print(
                            f"    ✓ Scrape failed as expected: {data['data'].get('error', 'Unknown error')[:80]}"
                        )
                    else:
                        print(f"    ✗ Expected error, got success")
                        all_passed = False

        except Exception as e:
            print(f"    ✗ Request failed: {e}")
            all_passed = False

    return all_passed


def test_cache_behavior():
    """Test caching behavior"""
    print("Testing cache behavior...")

    url = "https://example.com"
    payload = {"url": url, "mode": "CLEAN_TEXT", "fidelity": "FAST"}

    try:
        # First request (should miss cache)
        print("  First request (should miss cache)...")
        response1 = requests.post(
            f"{BASE_URL}/v1/scrape", headers=headers, json=payload, timeout=30
        )
        data1 = response1.json()
        cache_hit1 = data1.get("metadata", {}).get("cacheHit", False)

        # Second request (should hit cache)
        print("  Second request (should hit cache)...")
        response2 = requests.post(
            f"{BASE_URL}/v1/scrape", headers=headers, json=payload, timeout=30
        )
        data2 = response2.json()
        cache_hit2 = data2.get("metadata", {}).get("cacheHit", False)

        if not cache_hit1 and cache_hit2:
            print("  ✓ Cache behavior correct (miss then hit)")
            return True
        else:
            print(
                f"  ✗ Cache behavior incorrect: first={cache_hit1}, second={cache_hit2}"
            )
            return False

    except Exception as e:
        print(f"  ✗ Cache test error: {e}")
        return False


def main():
    """Run comprehensive tests"""
    print("=" * 80)
    print("COMPREHENSIVE SCRAPING SERVICE TEST")
    print("=" * 80)

    # Run basic endpoint tests
    basic_tests = [
        ("Health", test_health),
        ("Capabilities", test_capabilities),
        ("Error Handling", test_error_handling),
        ("Cache Behavior", test_cache_behavior),
        ("Batch Scraping", test_batch_scrape),
    ]

    basic_results = []
    for name, test_func in basic_tests:
        print(f"\n{name}:")
        result = test_func()
        basic_results.append((name, result))

    # Test each source with various modes
    print("\n" + "=" * 80)
    print("SOURCE-SPECIFIC TESTS")
    print("=" * 80)

    source_results = []
    for source in TEST_SOURCES[:3]:  # Test first 3 sources for speed
        print(f"\nTesting source: {source['name']} ({source['url']})")

        # Use cache-busted URL to avoid cache interference
        test_url = add_cache_buster(source["url"])

        source_passed = True

        # Test each mode with FAST fidelity
        for mode in MODES:
            passed = test_single_scrape(test_url, mode, "FAST", source["name"])
            if not passed:
                source_passed = False

        # Test hyperlinks endpoint specifically
        hyperlinks_passed = test_hyperlinks_endpoint(test_url, source["name"])
        if not hyperlinks_passed:
            source_passed = False

        source_results.append((source["name"], source_passed))

        # Brief pause between sources
        time.sleep(1)

    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)

    print("\nBasic Endpoint Tests:")
    for name, passed in basic_results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {name}: {status}")

    print("\nSource Tests:")
    for name, passed in source_results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {name}: {status}")

    # Overall success
    all_basic_passed = all(passed for _, passed in basic_results)
    all_sources_passed = (
        all(passed for _, passed in source_results) if source_results else True
    )

    if all_basic_passed and all_sources_passed:
        print("\n✅ ALL TESTS PASSED!")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
