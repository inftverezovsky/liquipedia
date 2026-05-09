import tls_client
import json
import sys
import argparse
from bs4 import BeautifulSoup

def scrape_hltv_matches(proxy_url=None):
    session = tls_client.Session(
        client_identifier="safari_ios_16_0",
        random_tls_extension_order=True
    )
    
    if proxy_url:
        session.proxies = {
            "http": proxy_url,
            "https": proxy_url
        }

    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
    }

    # 1. Try unofficial API
    url = "https://www.hltv-api.com/matches"
    try:
        response = session.get(url, headers=headers, timeout_seconds=10)
        if response.status_code == 200:
            data = response.json()
            matches = []
            for m in data.get('data', []):
                matches.append({
                    "id": str(m.get('id', '')),
                    "tournament": m.get('tournament', {}).get('name', 'Unknown'),
                    "team1": m.get('team1', {}).get('name', 'TBD'),
                    "team2": m.get('team2', {}).get('name', 'TBD'),
                    "unix_time": m.get('unix_time', 0)
                })
            if matches:
                print(json.dumps({"ok": True, "matches": matches}))
                return
    except Exception:
        pass

    # 2. Fallback to direct scraping
    scrape_direct_hltv(session, headers)

def scrape_direct_hltv(session, headers):
    url = "https://www.hltv.org/matches"
    headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    
    try:
        response = session.get(url, headers=headers, timeout_seconds=15)
        if "Just a moment" in response.text or response.status_code == 403:
            print(json.dumps({"error": "Cloudflare Block", "details": "JS Challenge detected"}))
            return

        soup = BeautifulSoup(response.text, 'html.parser')
        matches = []
        
        # HLTV Mobile structure
        # Matches are grouped under .events-container -> .event-headline + .upcoming-match
        sections = soup.select('.events-container')
        if not sections:
            # Try alternate structure
            sections = soup.select('.upcomingMatchesSection')

        for section in sections:
            # Find the tournament name for this section
            tournament_el = section.select_one('.event-headline')
            tournament_name = tournament_el.get_text(strip=True) if tournament_el else "Unknown"
            
            match_els = section.select('.upcoming-match')
            for el in match_els:
                # Match ID and Link
                info_link = el.select_one('a.match-info')
                if not info_link: continue
                
                href = info_link.get('href', '')
                match_id = href.split('/')
                match_id = match_id[2] if len(match_id) > 2 else ""
                
                # Teams
                team1_el = el.select_one('.match-teams .team-1 .team-name')
                team2_el = el.select_one('.match-teams .team-2 .team-name')
                
                if not team1_el or not team2_el: continue
                
                team1 = team1_el.get_text(strip=True)
                team2 = team2_el.get_text(strip=True)
                
                # Time
                unix_time = info_link.get('data-unix')
                if not unix_time:
                    time_el = el.select_one('[data-unix]')
                    unix_time = time_el.get('data-unix') if time_el else "0"
                
                matches.append({
                    "id": match_id,
                    "tournament": tournament_name,
                    "team1": team1,
                    "team2": team2,
                    "unix_time": int(unix_time) if unix_time else 0
                })

        if not matches:
            # Final fallback - just grab any upcoming-match on the page
            all_matches = soup.select('.upcoming-match')
            for el in all_matches:
                info_link = el.select_one('a.match-info')
                if not info_link: continue
                
                team1_el = el.select_one('.team-1 .team-name')
                team2_el = el.select_one('.team-2 .team-name')
                if not team1_el or not team2_el: continue
                
                matches.append({
                    "id": info_link.get('href', '').split('/')[2],
                    "tournament": "Upcoming",
                    "team1": team1_el.get_text(strip=True),
                    "team2": team2_el.get_text(strip=True),
                    "unix_time": int(info_link.get('data-unix', 0))
                })

        if not matches:
            print(json.dumps({"error": "No matches found in HTML", "html_preview": response.text[:500]}))
        else:
            print(json.dumps({"ok": True, "matches": matches}))

    except Exception as e:
        print(json.dumps({"error": f"Scraping failed: {str(e)}"}))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--proxy", help="Proxy URL (e.g. http://user:pass@host:port)")
    args = parser.parse_args()
    scrape_hltv_matches(args.proxy)
