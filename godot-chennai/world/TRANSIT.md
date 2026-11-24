# Transit coverage (OSM)

Built by `tools/geo` `cli transit` from the OSM extract and the built roads (decisions G-210..G-213, `docs/transit.md`). © OpenStreetMap contributors, ODbL 1.0. Headways and hours are **estimates**; Tamil text is as mapped in OSM and **needs native review**.

## Totals

| What | Count |
|---|---|
| Bus stops (one per stop, poles and platforms merged within 15 m) | 1463 |
| of which mapped `highway=bus_stop` | 1207 |
| `public_transport=platform` + `bus=yes` (before merging) | 36 |
| Stops with a name / with a Tamil name | 1250 / 240 |
| Stops served by a usable route | 483 |
| Bus stations and terminals (`amenity=bus_station`) | 132 |
| Railway stations (after merging node and area) | 185 |
| Rail lines (each direction a line) | 15 |
| Bus route relations | 77 |
| Routes clean | 11 |
| Routes fallback | 18 |
| Routes broken | 22 |
| Routes unusable | 26 |
| Routes with inferred stops | 28 |
| Routes whose stop members were put in order along their ways | 16 |
| First set (on a major road, by stop count) | 40 |

## Stops per area (nearest mapped suburb or neighbourhood; top 25)

| Area | Stops |
|---|---|
| Sriram Nagar | 22 |
| Chenganmaal Nagar | 21 |
| CIT Colony | 20 |
| Thousand Lights | 19 |
| Evening Bazaar | 16 |
| Vikram Sarabhai Industrial Estate | 16 |
| Koyambedu | 14 |
| Ram Nagar | 14 |
| St. Thomas Mount Cantonment | 14 |
| Ashok Nagar | 13 |
| Royapettah | 13 |
| Pudupet | 13 |
| Mylapore | 13 |
| Seva Nagar | 13 |
| Thiruvanmiyur | 13 |
| Lloyds Colony | 13 |
| Potheri | 13 |
| Tirumurthy Nagar | 12 |
| N S Nagar | 12 |
| Vadapalani | 11 |
| Guindy | 11 |
| Chetpet | 11 |
| Mannadi | 10 |
| Maraimalai Nagar Industrial Area | 10 |
| East Tambaram | 10 |

## Stations per system

| System | Stations | With Tamil name | On a line |
|---|---|---|---|
| suburban | 89 | 66 | 59 |
| mrts | 3 | 0 | 2 |
| metro | 93 | 63 | 51 |

## Rail lines

| Line | System | Stations | Headway (min, estimate) |
|---|---|---|---|
| Tambaram - Chengalpattu suburban line | suburban | 6 | 15 |
| Chennai Beach - Tambaram suburban line | suburban | 18 | 8 |
| Chennai Central/ Beach - Arakkonam - Tiruttani suburban line | suburban | 20 | 15 |
| Blue Line (Chennai International Airport → Wimco Nagar Depot) | metro | 26 | 8 |
| Green Line (St. Thomas Mount → Chennai Central) | metro | 17 | 8 |
| Chennai MRTS: Chennai Beach → Saint Thomas Mount | mrts | 20 | 15 |
| Blue Line (Wimco Nagar Depot → Chennai International Airport) | metro | 26 | 8 |
| Green Line: Chennai Central → St. Thomas Mount | metro | 17 | 8 |
| Chennai MRTS: Saint Thomas Mount → Chennai Beach | mrts | 20 | 15 |
| Yellow Line: Vadapalani → Poonamallee Bypass | metro | 11 | 8 |
| Yellow Line: Poonamallee Bypass → Vadapalani | metro | 11 | 8 |
| Inter-Corridor Line (Chennai International Airport → Chennai Central) | metro | 19 | 8 |
| Inter-Corridor Line: Chennai Central → Chennai International Aiirport | metro | 19 | 8 |
| Chennai Beach - Tambaram suburban line | suburban | 18 | 8 |
| Chennai Central/ Beach → Sullurpeta suburban line | suburban | 5 | 15 |

## Routes

| Ref | Name | Status | Stops | Legs found | On mapped ways | Length km | On decks m | Major roads | First set |
|---|---|---|---|---|---|---|---|---|---|
| S570 | MTC S570: CMBT ↔ Kelambakkam | clean | 27 | 26/26 | 95 % | 42.2 | 17011 | Adyar or Cooum bridge, Anna Salai (Mount Road), Kathipara, OMR (Rajiv Gandhi Salai) | yes |
| 114 | 114: CMBT to Redhills | clean (inferred stops) | 21 | 20/20 | 99 % | 16.0 | 8703 | Adyar or Cooum bridge | yes |
| 114 | 114: Redhills to CMBT | clean (inferred stops) | 21 | 20/20 | 99 % | 16.7 | 6226 | Adyar or Cooum bridge | yes |
| 266 | 266: Avadi -> Tambaram | clean | 20 | 19/19 | 100 % | 30.5 | 13264 | Adyar or Cooum bridge, GST Road | yes |
| 11G | 11G: Broadway -> KK Nagar | clean | 20 | 19/19 | 98 % | 14.6 | 2723 | Adyar or Cooum bridge, Anna Salai (Mount Road) | yes |
| S13 | MTC S13: Guindy Race Course to Velachery | clean | 17 | 16/16 | 100 % | 4.9 | 867 |  |  |
| S43 | S43:Villivakkam to pudhur | clean (inferred stops) | 16 | 15/15 | 97 % | 9.5 | 705 |  |  |
| 14M | 14M: NGO Colony → Medavakkam Junction | clean | 10 | 9/9 | 97 % | 10.2 | 856 |  |  |
| 266 | 266: Tambaram -> Avadi Terminal | clean (inferred stops) | 10 | 9/9 | 100 % | 28.0 | 13430 | Adyar or Cooum bridge, GST Road, Poonamallee High Road | yes |
| 3 | 3: T. Nagar to Thiruvanmiyur | clean | 3 | 2/2 | 82 % | 13.3 | 2356 | Anna Salai (Mount Road), OMR (Rajiv Gandhi Salai) |  |
| E18 | E18: Guduvancheri → Broadway | clean | 3 | 2/2 | 100 % | 16.1 | 5160 | Anna Salai (Mount Road), GST Road, Kathipara |  |
| 588C | 588C: Mamallapuram → CMBT | fallback (inferred stops) | 43 | 42/42 | 87 % | 61.9 | 22792 | Adyar or Cooum bridge, Anna Salai (Mount Road), ECR, GST Road, Kathipara, OMR (Rajiv Gandhi Salai) | yes |
| V51 | V51: Tambaram West → T. Nagar | fallback | 32 | 31/31 | 96 % | 25.7 | 5094 | Anna Salai (Mount Road), GST Road | yes |
| 21G | 21G: Tambaram → Broadway | fallback (inferred stops) | 30 | 29/29 | 91 % | 29.8 | 10855 | Adyar or Cooum bridge, Anna Salai (Mount Road), GST Road, Kathipara | yes |
| 147C | 147C: T.Nagar → Ambatttur O.T. | fallback | 27 | 26/26 | 80 % | 25.1 | 7394 | Adyar or Cooum bridge | yes |
| 51 | 51: West Tambaram → Velachery | fallback | 26 | 25/25 | 97 % | 18.0 | 3911 | GST Road | yes |
| 5C | 5C: Broadway → Taramani | fallback | 22 | 21/21 | 79 % | 17.2 | 6934 | Adyar or Cooum bridge, Anna Salai (Mount Road), OMR (Rajiv Gandhi Salai) | yes |
| 147C | 147C: Ambathur O.T. → T.Nagar | fallback | 22 | 21/21 | 83 % | 18.8 | 5821 | Adyar or Cooum bridge | yes |
| 51 | 51: Velachery → West Tambaram | fallback | 20 | 19/19 | 97 % | 17.1 | 5207 | GST Road | yes |
| 27D | 27D: Villivakkam → Foreshore Estate | fallback | 19 | 18/18 | 71 % | 47.6 | 7278 | Adyar or Cooum bridge, Anna Salai (Mount Road), Poonamallee High Road | yes |
| S13 | MTC S13: Velachery to Guindy Race Course | fallback | 17 | 16/16 | 100 % | 5.5 | 1526 |  |  |
| 27D | 27D: Foreshore Estate → Villivakkam | fallback | 16 | 15/15 | 60 % | 25.8 | 3947 | Adyar or Cooum bridge, Anna Salai (Mount Road), Poonamallee High Road | yes |
| 5C | 5C: Taramani → Broadway | fallback | 15 | 14/14 | 91 % | 12.8 | 3038 | OMR (Rajiv Gandhi Salai) | yes |
| 104 | 104: Tambaram MEPZ → Redhills | fallback (inferred stops) | 14 | 13/13 | 74 % | 57.8 | 26776 | Adyar or Cooum bridge, GST Road | yes |
| M70 | M70: Koyambedu CMBT → Thiruvanmiyur | fallback | 12 | 11/11 | 91 % | 20.5 | 4580 | Adyar or Cooum bridge, Anna Salai (Mount Road), Kathipara, OMR (Rajiv Gandhi Salai) | yes |
| 19B | 19B: Saidapet → Kelambakkam | fallback | 7 | 6/6 | 100 % | 24.2 | 6631 | Anna Salai (Mount Road), OMR (Rajiv Gandhi Salai) | yes |
| D70CT | D70CT: Velachery → Elango Nagar Officer Colony | fallback (inferred stops) | 7 | 6/6 | 92 % | 2.3 | 0 |  |  |
| D51ET | D51ET: Chithalapakkam TNHB → Broadway | fallback (inferred stops) | 7 | 6/6 | 92 % | 2.3 | 0 |  |  |
| 3 | 3: Thiruvanmiyur to T. Nagar | fallback | 4 | 3/3 | 66 % | 12.9 | 2942 | Anna Salai (Mount Road) | yes |
| 29C | 29C: Perambur --> Besant nagar | broken | 31 | 40/44 | 93 % | 12.3 | 3494 | Adyar or Cooum bridge, Poonamallee High Road | yes |
| V51 | V51: T. Nagar → Tambaram West | broken (inferred stops) | 30 | 45/46 | 67 % | 30.3 | 5388 | GST Road | yes |
| D70 | D70: Velachery → Ambathur Industrial Estate | broken | 21 | 28/29 | 99 % | 14.9 | 9096 | Adyar or Cooum bridge, Anna Salai (Mount Road), GST Road, Kathipara | yes |
| E18 | E18: Broadway → Guduvancheri | broken (inferred stops) | 19 | 33/36 | 64 % | 9.9 | 3739 | Adyar or Cooum bridge, Anna Salai (Mount Road) | yes |
| 21G | 21G: Broadway → Tambaram | broken (inferred stops) | 19 | 30/33 | 64 % | 9.9 | 3739 | Adyar or Cooum bridge, Anna Salai (Mount Road) | yes |
| M1 | M1: Keelkattalai → Thiruvanmiyur | broken | 18 | 17/18 | 87 % | 9.7 | 1433 | OMR (Rajiv Gandhi Salai) | yes |
| 588C | 588C: CMBT → Mamallapuram | broken | 17 | 16/17 | 94 % | 17.0 | 6497 | Adyar or Cooum bridge, Anna Salai (Mount Road), ECR, Kathipara, OMR (Rajiv Gandhi Salai) | yes |
| 23C | 23C: Ayanavaram Bus Terminus → Besant Nagar | broken | 17 | 18/21 | 87 % | 16.4 | 4824 | Adyar or Cooum bridge, Anna Salai (Mount Road), Poonamallee High Road | yes |
| 104 | 104: Redhills → Tambaram MEPZ | broken (inferred stops) | 17 | 23/24 | 100 % | 15.4 | 2906 |  |  |
| 18D | 18D: Keelkattalai → Broadway | broken | 16 | 15/18 | 92 % | 18.2 | 7140 | Adyar or Cooum bridge, Anna Salai (Mount Road) | yes |
| M1 | M1: Thiruvanmiyur → Keelkattalai | broken | 14 | 13/14 | 77 % | 13.3 | 2853 | OMR (Rajiv Gandhi Salai) | yes |
| 76 | 76: CMBT → Medavakkam Junction | broken | 13 | 12/13 | 92 % | 22.5 | 6620 | Adyar or Cooum bridge, GST Road, Kathipara | yes |
| 11G | 11G: KK Nagar -> Broadway | broken | 13 | 12/14 | 87 % | 13.3 | 3213 | Adyar or Cooum bridge, Anna Salai (Mount Road) | yes |
| D70 | D70: Ambattur Industrial Estate → Velachery | broken | 10 | 18/20 | 93 % | 12.5 | 6884 | Adyar or Cooum bridge | yes |
| 14M | 14M: Medavakkam Junction → NGO Colony | broken | 10 | 9/10 | 97 % | 9.8 | 2568 |  |  |
| 72 | MTC Route 72: T. Nagar ==> Thiruverkadu | broken (inferred stops) | 10 | 15/18 | 100 % | 7.4 | 4170 | Poonamallee High Road | yes |
| 18D | 18D: Broadway → Keelkattalai | broken | 9 | 8/9 | 90 % | 22.0 | 5577 | Adyar or Cooum bridge, Anna Salai (Mount Road) | yes |
| M70 | M70: Thiruvanmiyur → Koyambedu CMBT | broken | 8 | 15/18 | 86 % | 9.0 | 4872 | Adyar or Cooum bridge, Anna Salai (Mount Road), GST Road, Kathipara | yes |
| M18C | Bus M18C: Keelkattalai --> T.Nagar | broken | 7 | 6/7 | 100 % | 12.3 | 4417 | Anna Salai (Mount Road), GST Road, Kathipara | yes |
| 15B | 15B: Broadway → CMBT | broken | 6 | 5/6 | 88 % | 7.7 | 1235 | Adyar or Cooum bridge, Poonamallee High Road | yes |
| 76 | 76: Medavakkam Junction → CMBT | broken | 6 | 5/6 | 100 % | 5.1 | 1530 |  |  |
| M18C | Bus M18C: T. Nagar --> Keelkattalai | broken | 4 | 3/4 | 95 % | 13.2 | 3861 | Anna Salai (Mount Road), GST Road, Kathipara | yes |
|  | Hostel - Main Gate | unusable | 10 | 1/9 | 0 % | 0.0 | 0 |  |  |
| 15B | 15B: CMBT → Broadway | unusable | 3 | 1/2 | 0 % | 0.0 | 0 |  |  |
| M51F | M51F | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 40L | 40L: Mogappair West Bus Terminus → Marina | unusable | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 147B | 147B: Mogappair West Bus Terminus → Thiyagaraya nagar | unusable | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 77J | 77J: Mogappair West Bus Terminus → Guindy | unusable | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 70W | 70W: Mogappair West Bus Terminus → Velacherry | unusable | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 20A | 20A: Mogappair West → Broadway | unusable | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 62B | 62B: Mogappair West Bus Terminus → Redhills | unusable | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 48A | 48A: Mogappair West Bus Terminus → Madhavaram | unusable | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| SM70 | MTC SM70 | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| M119 | MTC M119 | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| M119A | MTC M119A | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| Z570 | MTC Z570 | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| SM07 | MTC SM07 | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| XH21 | MTC XH21 | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| XA21 | MTC XA21 | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| XM70 | MTC XM70 | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| XA21V | MTC XA21V | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| Z219A | MTC Z219A | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| S519 | MTC S519 | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| O7K | MTC O7K | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| O5K | MTC O5K | unusable (inferred stops) | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 114 |  | unusable | 1 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 55C | 55C: Tambaram → Adhanur | unusable | 0 | 0/0 | 0 % | 0.0 | 0 |  |  |
| 7M | 7M: Mogappair West Bus Terminus → Broadway | unusable | 0 | 0/0 | 0 % | 0.0 | 0 |  |  |

## Why routes are unusable or broken

- fewer than 2 stops: 24
- legs not found: 22
- longest drivable run has 2 stops: 2
