"""Airports BukkaPay customers can search, by IATA code.

African airports first (our markets), then the main intercontinental hubs
African travellers connect through. Airline APIs accept any IATA code; this
list only powers the airport picker and validates input.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Airport:
    iata: str
    name: str
    city: str
    country_code: str


AIRPORTS: tuple[Airport, ...] = (
    # Southern Africa
    Airport("JNB", "O. R. Tambo International", "Johannesburg", "ZA"),
    Airport("CPT", "Cape Town International", "Cape Town", "ZA"),
    Airport("DUR", "King Shaka International", "Durban", "ZA"),
    Airport("PLZ", "Chief Dawid Stuurman International", "Gqeberha", "ZA"),
    Airport("ELS", "King Phalo", "East London", "ZA"),
    Airport("BFN", "Bram Fischer International", "Bloemfontein", "ZA"),
    Airport("GRJ", "George", "George", "ZA"),
    Airport("MQP", "Kruger Mpumalanga International", "Mbombela", "ZA"),
    Airport("HLA", "Lanseria International", "Johannesburg", "ZA"),
    Airport("WDH", "Hosea Kutako International", "Windhoek", "NA"),
    Airport("GBE", "Sir Seretse Khama International", "Gaborone", "BW"),
    Airport("MUB", "Maun", "Maun", "BW"),
    Airport("HRE", "Robert Gabriel Mugabe International", "Harare", "ZW"),
    Airport("VFA", "Victoria Falls", "Victoria Falls", "ZW"),
    Airport("BUQ", "Joshua Mqabuko Nkomo International", "Bulawayo", "ZW"),
    Airport("LUN", "Kenneth Kaunda International", "Lusaka", "ZM"),
    Airport("LLW", "Kamuzu International", "Lilongwe", "MW"),
    Airport("MPM", "Maputo International", "Maputo", "MZ"),
    Airport("SHO", "King Mswati III International", "Manzini", "SZ"),
    Airport("MSU", "Moshoeshoe I International", "Maseru", "LS"),
    Airport("TNR", "Ivato International", "Antananarivo", "MG"),
    Airport("MRU", "Sir Seewoosagur Ramgoolam International", "Mauritius", "MU"),
    Airport("SEZ", "Seychelles International", "Mahé", "SC"),
    Airport("LAD", "Quatro de Fevereiro", "Luanda", "AO"),
    # East Africa
    Airport("NBO", "Jomo Kenyatta International", "Nairobi", "KE"),
    Airport("MBA", "Moi International", "Mombasa", "KE"),
    Airport("KIS", "Kisumu International", "Kisumu", "KE"),
    Airport("EBB", "Entebbe International", "Entebbe", "UG"),
    Airport("KGL", "Kigali International", "Kigali", "RW"),
    Airport("DAR", "Julius Nyerere International", "Dar es Salaam", "TZ"),
    Airport("JRO", "Kilimanjaro International", "Kilimanjaro", "TZ"),
    Airport("ZNZ", "Abeid Amani Karume International", "Zanzibar", "TZ"),
    Airport("ADD", "Addis Ababa Bole International", "Addis Ababa", "ET"),
    Airport("JUB", "Juba International", "Juba", "SS"),
    Airport("MGQ", "Aden Adde International", "Mogadishu", "SO"),
    Airport("JIB", "Djibouti–Ambouli International", "Djibouti", "DJ"),
    # West & Central Africa
    Airport("LOS", "Murtala Muhammed International", "Lagos", "NG"),
    Airport("ABV", "Nnamdi Azikiwe International", "Abuja", "NG"),
    Airport("PHC", "Port Harcourt International", "Port Harcourt", "NG"),
    Airport("KAN", "Mallam Aminu Kano International", "Kano", "NG"),
    Airport("ACC", "Kotoka International", "Accra", "GH"),
    Airport("KMS", "Prempeh I International", "Kumasi", "GH"),
    Airport("ABJ", "Félix-Houphouët-Boigny International", "Abidjan", "CI"),
    Airport("DSS", "Blaise Diagne International", "Dakar", "SN"),
    Airport("BJL", "Banjul International", "Banjul", "GM"),
    Airport("FNA", "Lungi International", "Freetown", "SL"),
    Airport("ROB", "Roberts International", "Monrovia", "LR"),
    Airport("LFW", "Gnassingbé Eyadéma International", "Lomé", "TG"),
    Airport("COO", "Cadjehoun", "Cotonou", "BJ"),
    Airport("OUA", "Thomas Sankara International", "Ouagadougou", "BF"),
    Airport("BKO", "Modibo Keita International", "Bamako", "ML"),
    Airport("NIM", "Diori Hamani International", "Niamey", "NE"),
    Airport("DLA", "Douala International", "Douala", "CM"),
    Airport("NSI", "Yaoundé Nsimalen International", "Yaoundé", "CM"),
    Airport("LBV", "Léon-Mba International", "Libreville", "GA"),
    Airport("FIH", "N'djili International", "Kinshasa", "CD"),
    Airport("FBM", "Lubumbashi International", "Lubumbashi", "CD"),
    Airport("BZV", "Maya-Maya", "Brazzaville", "CG"),
    # North Africa
    Airport("CAI", "Cairo International", "Cairo", "EG"),
    Airport("HRG", "Hurghada International", "Hurghada", "EG"),
    Airport("CMN", "Mohammed V International", "Casablanca", "MA"),
    Airport("RAK", "Marrakesh Menara", "Marrakesh", "MA"),
    Airport("ALG", "Houari Boumediene", "Algiers", "DZ"),
    Airport("TUN", "Tunis–Carthage International", "Tunis", "TN"),
    Airport("KRT", "Khartoum International", "Khartoum", "SD"),
    # Intercontinental hubs
    Airport("DXB", "Dubai International", "Dubai", "AE"),
    Airport("AUH", "Zayed International", "Abu Dhabi", "AE"),
    Airport("DOH", "Hamad International", "Doha", "QA"),
    Airport("IST", "Istanbul", "Istanbul", "TR"),
    Airport("LHR", "Heathrow", "London", "GB"),
    Airport("LGW", "Gatwick", "London", "GB"),
    Airport("CDG", "Charles de Gaulle", "Paris", "FR"),
    Airport("AMS", "Schiphol", "Amsterdam", "NL"),
    Airport("FRA", "Frankfurt", "Frankfurt", "DE"),
    Airport("BRU", "Brussels", "Brussels", "BE"),
    Airport("LIS", "Humberto Delgado", "Lisbon", "PT"),
    Airport("MAD", "Adolfo Suárez Madrid–Barajas", "Madrid", "ES"),
    Airport("FCO", "Leonardo da Vinci–Fiumicino", "Rome", "IT"),
    Airport("JFK", "John F. Kennedy International", "New York", "US"),
    Airport("IAD", "Washington Dulles International", "Washington", "US"),
    Airport("ATL", "Hartsfield–Jackson Atlanta International", "Atlanta", "US"),
    Airport("YYZ", "Toronto Pearson International", "Toronto", "CA"),
    Airport("GRU", "São Paulo/Guarulhos International", "São Paulo", "BR"),
    Airport("BOM", "Chhatrapati Shivaji Maharaj International", "Mumbai", "IN"),
    Airport("DEL", "Indira Gandhi International", "Delhi", "IN"),
    Airport("SIN", "Changi", "Singapore", "SG"),
    Airport("HKG", "Hong Kong International", "Hong Kong", "HK"),
    Airport("PEK", "Beijing Capital International", "Beijing", "CN"),
    Airport("CAN", "Guangzhou Baiyun International", "Guangzhou", "CN"),
    Airport("PER", "Perth", "Perth", "AU"),
    Airport("SYD", "Sydney Kingsford Smith", "Sydney", "AU"),
)

_BY_CODE = {a.iata: a for a in AIRPORTS}


def get(code: str | None) -> Airport | None:
    return _BY_CODE.get((code or "").strip().upper())


def search(q: str | None, limit: int = 20) -> list[Airport]:
    q = (q or "").strip().lower()
    if not q:
        return list(AIRPORTS[:limit])
    exact = [a for a in AIRPORTS if a.iata.lower() == q]
    rest = [a for a in AIRPORTS if a not in exact and (
        q in a.city.lower() or q in a.name.lower() or a.iata.lower().startswith(q) or a.country_code.lower() == q
    )]
    return (exact + rest)[:limit]
