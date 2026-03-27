#!/usr/bin/env python3
"""
Test script for Scraping Service API
"""

import requests
import json
import sys
import argparse


class ScrapingClient:
    def __init__(self, base_url="http://localhost:3002", api_key="scraping-key-1"):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
        }

    def health(self):
        """Check service health"""
        response = requests.get(f"{self.base_url}/health")
        return response.json()

    def capabilities(self):
        """Get service capabilities"""
        response = requests.get(f"{self.base_url}/v1/capabilities")
        return response.json()

    def scrape(self, url, mode="CLEAN_TEXT", fidelity="DEEP", options=None):
        """Scrape a single URL"""
        payload = {
            "url": url,
            "mode": mode,
            "fidelity": fidelity,
        }

        if options:
            payload["options"] = options

        response = requests.post(
            f"{self.base_url}/v1/scrape", headers=self.headers, json=payload
        )
        return response.json()

    def scrape_batch(self, urls, parallel=3):
        """Scrape multiple URLs"""
        payload = {"urls": urls, "options": {"parallel": parallel}}

        response = requests.post(
            f"{self.base_url}/v1/scrape/batch", headers=self.headers, json=payload
        )
        return response.json()

    def scrape_selectors(self, url, selectors, fidelity="DEEP", as_json=True):
        """Scrape using CSS selectors"""
        payload = {
            "url": url,
            "selectors": selectors,
            "fidelity": fidelity,
            "options": {"asJson": as_json},
        }

        response = requests.post(
            f"{self.base_url}/v1/scrape/selectors", headers=self.headers, json=payload
        )
        return response.json()

    def scrape_images(self, url, image_query=None, limit=20, fidelity="DEEP"):
        """Extract images from URL"""
        payload = {"url": url, "fidelity": fidelity, "options": {"limit": limit}}

        if image_query:
            payload["imageQuery"] = image_query

        response = requests.post(
            f"{self.base_url}/v1/scrape/images", headers=self.headers, json=payload
        )
        return response.json()

    def screenshot(self, url, full_page=True, width=1440, height=900):
        """Take screenshot of URL"""
        payload = {
            "url": url,
            "options": {"fullPage": full_page, "width": width, "height": height},
        }

        response = requests.post(
            f"{self.base_url}/v1/scrape/screenshot", headers=self.headers, json=payload
        )
        return response.json()

    def scrape_and_store(
        self, url, user_email, tags=None, metadata=None, scrape_options=None
    ):
        """Scrape and store to Cogniti"""
        payload = {
            "url": url,
            "userEmail": user_email,
            "tags": tags or ["scraped"],
        }

        if metadata:
            payload["metadata"] = metadata

        if scrape_options:
            payload["scrapeOptions"] = scrape_options

        response = requests.post(
            f"{self.base_url}/v1/scrape/store", headers=self.headers, json=payload
        )
        return response.json()


def main():
    parser = argparse.ArgumentParser(description="Test Scraping Service API")
    parser.add_argument(
        "--url", default="http://localhost:3002", help="Base URL of scraping service"
    )
    parser.add_argument("--api-key", default="scraping-key-1", help="API key")
    parser.add_argument(
        "command",
        choices=[
            "health",
            "capabilities",
            "scrape",
            "batch",
            "selectors",
            "images",
            "screenshot",
            "store",
        ],
    )
    parser.add_argument("--target", help="Target URL for scrape commands")

    args = parser.parse_args()

    client = ScrapingClient(base_url=args.url, api_key=args.api_key)

    if args.command == "health":
        result = client.health()
        print(json.dumps(result, indent=2))

    elif args.command == "capabilities":
        result = client.capabilities()
        print(json.dumps(result, indent=2))

    elif args.command == "scrape":
        if not args.target:
            print("Error: --target required for scrape command")
            sys.exit(1)
        result = client.scrape(args.target)
        print(json.dumps(result, indent=2))

    elif args.command == "batch":
        # Example batch with 2 URLs
        urls = [
            {"url": "https://example.com", "mode": "CLEAN_TEXT"},
            {"url": "https://httpbin.org/html", "mode": "FULL_HTML"},
        ]
        result = client.scrape_batch(urls)
        print(json.dumps(result, indent=2))

    elif args.command == "selectors":
        if not args.target:
            print("Error: --target required for selectors command")
            sys.exit(1)
        selectors = ["h1", "title", "p"]
        result = client.scrape_selectors(args.target, selectors)
        print(json.dumps(result, indent=2))

    elif args.command == "images":
        if not args.target:
            print("Error: --target required for images command")
            sys.exit(1)
        result = client.scrape_images(args.target)
        print(json.dumps(result, indent=2))

    elif args.command == "screenshot":
        if not args.target:
            print("Error: --target required for screenshot command")
            sys.exit(1)
        result = client.screenshot(args.target)
        print(json.dumps(result, indent=2))

    elif args.command == "store":
        if not args.target:
            print("Error: --target required for store command")
            sys.exit(1)
        result = client.scrape_and_store(
            args.target, user_email="test@example.com", tags=["test", "scraping"]
        )
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
