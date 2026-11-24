# Chennai area atlas

Researched character of every major area, so buildings, signs and street life can be placed to match. Decision G-200. The data lives in `data/areas/` (`areas.json`, `landmarks_shortlist.json`, `palettes.json`, `coverage.json`, with JSON schemas) and this page is generated from it.

**Source rule.** OpenStreetMap is the only geodata (extract of 2026-11-23, ODbL 1.0, © OpenStreetMap contributors). Facts about character come from public pages (Wikipedia, heritage and tourism pages, local news) and are paraphrased; every claim carries a source URL or is marked `estimated` (with its basis) or `unverified`. Wall colours, roof weights, storey weights and street widths are estimates, never measurements. Tamil names are only those OSM carries (`name:ta`) and all need native review. No business names or brands appear; shopping malls and IT parks are generic entries.

**Network note.** `en.wikipedia.org`, `wikidata.org` and most news and heritage hosts were not reachable from the build sandbox. Claims marked `sourced` rest on search-result summaries of those pages (the URL is the page the summary came from) plus the Wikimedia Commons API (reachable) for photo titles and licences. The first image request to the Commons image host returned HTTP 429 and image fetching was stopped, so **no photo was viewed**; colour palettes are written from descriptions only.

## Counts

- Areas: 31. Landmarks: 100 (tier A 18, B 72, C 10); all 100 were found in the OSM extract.
- Claims: 519 in total; sourced 289, read from OSM or the world data 93, estimated 10, unverified 127. On top of that every area has four estimate blocks (storeys, roofs, wall palette, street width), each with its basis.
- Distinct source pages: 205 (of which OSM objects: 125).

Tier meaning: **A** hero model by hand, **B** parametric kit (parameters in the data), **C** a recoloured standard building.

## Coverage: what OSM says about buildings in each area

Buildings are assigned to the area whose boundary (circle or corridor, see `areas.json`) contains their centroid, nearest centre first, so each is counted once. `world` columns come from the built world (`world/`, slivers dropped, multipolygons split); `OSM extract` columns count every building way or multipolygon in the extract, including `building:colour` and `building:material`, which the world format does not keep. Areas overlap on purpose in a few places (George Town contains Parry's Corner), so a building counts for the closer centre.

| Area | Buildings (world) | Levels mapped | Height tagged | Roof shape tagged | Use known | Buildings (OSM extract) | Colour tag | Material tag | Roof colour | Roof material |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| George Town | 6,408 | 3,185 (49.7 %) | 1 | 2 | 109 (1.7 %) | 6,447 | 0 | 2 | 0 | 0 |
| Parry's Corner | 548 | 478 (87.2 %) | 0 | 0 | 23 (4.2 %) | 548 | 0 | 0 | 0 | 0 |
| Fort St George and Island Grounds | 192 | 27 (14.1 %) | 0 | 0 | 6 (3.1 %) | 192 | 0 | 0 | 0 | 0 |
| Park Town and Chennai Central | 580 | 83 (14.3 %) | 0 | 1 | 20 (3.4 %) | 597 | 1 | 2 | 1 | 0 |
| Egmore | 1,068 | 39 (3.7 %) | 0 | 0 | 20 (1.9 %) | 1,068 | 0 | 0 | 0 | 0 |
| Triplicane | 840 | 2 (0.2 %) | 0 | 0 | 6 (0.7 %) | 840 | 0 | 0 | 0 | 0 |
| Marina and Santhome | 3,460 | 93 (2.7 %) | 3 | 0 | 135 (3.9 %) | 3,526 | 0 | 0 | 0 | 0 |
| Mylapore | 606 | 1 (0.2 %) | 0 | 0 | 8 (1.3 %) | 607 | 0 | 0 | 0 | 0 |
| Mandaveli | 495 | 1 (0.2 %) | 0 | 2 | 6 (1.2 %) | 495 | 0 | 0 | 0 | 0 |
| Royapettah | 891 | 26 (2.9 %) | 0 | 0 | 38 (4.3 %) | 891 | 0 | 0 | 0 | 0 |
| T. Nagar (Thyagaraya Nagar) | 4,769 | 77 (1.6 %) | 0 | 5 | 48 (1.0 %) | 4,768 | 0 | 1 | 0 | 0 |
| Nungambakkam | 653 | 0 (0.0 %) | 0 | 0 | 8 (1.2 %) | 653 | 0 | 0 | 0 | 0 |
| Kodambakkam and Vadapalani | 7,649 | 35 (0.5 %) | 1 | 0 | 47 (0.6 %) | 7,653 | 0 | 0 | 0 | 0 |
| Anna Nagar | 12,782 | 22 (0.2 %) | 1 | 1 | 87 (0.7 %) | 12,787 | 1 | 0 | 0 | 0 |
| Kilpauk | 1,606 | 11 (0.7 %) | 0 | 0 | 25 (1.6 %) | 1,605 | 0 | 0 | 0 | 0 |
| Purasawalkam | 2,147 | 33 (1.5 %) | 0 | 0 | 12 (0.6 %) | 2,147 | 0 | 0 | 0 | 0 |
| Perambur | 7,154 | 9 (0.1 %) | 0 | 0 | 25 (0.3 %) | 7,153 | 3 | 0 | 12 | 0 |
| Adyar | 1,169 | 17 (1.5 %) | 2 | 0 | 17 (1.5 %) | 1,169 | 0 | 0 | 0 | 0 |
| Besant Nagar and Elliot's Beach | 1,100 | 63 (5.7 %) | 0 | 0 | 46 (4.2 %) | 1,100 | 0 | 0 | 0 | 0 |
| Guindy | 505 | 32 (6.3 %) | 0 | 0 | 35 (6.9 %) | 504 | 0 | 0 | 0 | 0 |
| Saidapet | 2,122 | 30 (1.4 %) | 0 | 0 | 106 (5.0 %) | 2,123 | 0 | 0 | 0 | 0 |
| Velachery | 9,300 | 49 (0.5 %) | 11 | 6 | 127 (1.4 %) | 9,302 | 5 | 6 | 0 | 0 |
| Tambaram | 10,614 | 30 (0.3 %) | 1 | 0 | 173 (1.6 %) | 10,614 | 0 | 0 | 0 | 0 |
| Pallavaram, Meenambakkam and the airport | 12,846 | 26 (0.2 %) | 0 | 0 | 128 (1.0 %) | 12,846 | 0 | 0 | 0 | 0 |
| OMR and Sholinganallur IT corridor | 17,711 | 111 (0.6 %) | 11 | 0 | 290 (1.6 %) | 17,711 | 5 | 0 | 2 | 0 |
| Ennore and North Chennai port | 2,295 | 4 (0.2 %) | 0 | 0 | 33 (1.4 %) | 2,324 | 0 | 0 | 0 | 0 |
| Ambattur Industrial Estate | 4,071 | 7 (0.2 %) | 0 | 0 | 47 (1.2 %) | 4,071 | 0 | 0 | 0 | 0 |
| Thiruvanmiyur | 1,074 | 25 (2.3 %) | 0 | 0 | 91 (8.5 %) | 1,074 | 0 | 0 | 0 | 0 |
| Chetpet | 711 | 3 (0.4 %) | 0 | 0 | 20 (2.8 %) | 711 | 0 | 0 | 0 | 0 |
| Chengalpattu | 55 | 0 (0.0 %) | 0 | 0 | 5 (9.1 %) | 55 | 0 | 0 | 0 | 0 |
| Pulicat and the northern lagoon edge | 24 | 0 (0.0 %) | 2 | 1 | 6 (25.0 %) | 24 | 0 | 0 | 0 | 0 |
| *Outside all 31 areas* | 275,838 | 4,075 (1.5 %) | 70 | 27 | 3,787 | 276,022 | 138 | 38 | 156 | 2 |
| **In the 31 areas** | 115,445 | 4,519 (3.9 %) | 33 | 18 | 1,747 (1.5 %) | 115,605 | 15 | 11 | 15 | 0 |

Reading it: levels are mapped for 3.9 % of the buildings inside the areas, four fifths of them in George Town and Parry's Corner (OSM mappers surveyed the old quarter); height, roof shape, colour and material tags are each under 0.2 %. Everywhere else the game's floors and heights come from a footprint rule (`heightFrom = estimated`), and the world's floor histogram is a placeholder, not a survey. This is why the researched palettes and storey weights in `palettes.json` matter: OSM alone cannot say whether a street is cream lime wash or pastel apartment paint. Chengalpattu and Pulicat hold only 55 and 24 buildings because ring 3 of the world keeps roads and few buildings.

## The atlas

### George Town

*Tamil (OSM, needs native review):* முத்தியால்பேட்டை &nbsp; *Type:* old-commercial &nbsp; *Centre:* x 7814, z -789 (13.092092, 80.282243) &nbsp; *Boundary:* circle 900 m

- Tightly packed, narrow-laned wholesale and trading quarter that grew where the old walled 'Black Town' stood north of the fort.
- Colonial and Indo-Saracenic institutions (the High Court, the Armenian Church, a medical college) sit among crowded commercial blocks and temples.
- Mint Street and Flower Bazaar (Badrian Street) are known for wholesale trade; the lanes are narrow and busy from early morning.

**Landmarks:** Madras High Court (A); Armenian Church of the Virgin Mary (B); Kaalikambal Kamadeswarar Temple (B); Kandhakottam Temple (B); Mint Street (Peddanaickenpet) (B); Stanley Medical College and Hospital (C); Sowcarpet and Flower Bazaar (B).

**Walking there, a player would see:** narrow, winding and shaded by overhanging upper floors; frequent bottlenecks at junctions; buildings mostly 3 storeys (range 1 to 5); roofs mainly flat parapet roof, often with a water tank and staircase head (62 %) and Madras terrace on the oldest masonry houses (19 %); walls in aged lime wash #E4D7B8, ochre #D9B25F, red brick showing through #A5502F, cream #EFE6D2. Street life: Wholesale: Flower Bazaar (Badrian Street) traded flowers by the sack before the Koyambedu market opened in 1996; many wholesale shops there were sealed on High Court orders. Signs: Tamil top line, English below; also Hindi and Gujarati lettering on some trading houses (unverified).

**OSM alone gives:** 6,408 building footprints (levels mapped on 49.7 %, roof shape on 2, colour tags on 0), street names and the 7 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### Parry's Corner

*Tamil (OSM, needs native review):* பாரிமுனை &nbsp; *Type:* dense-market &nbsp; *Centre:* x 8443, z -506 (13.089546, 80.288056) &nbsp; *Boundary:* circle 500 m

- The busy southern end of George Town, around the High Court and Armenian Street.
- A hub for bus termini, bazaars and old commercial offices; heavy foot traffic all day. *(unverified)*
- Commercial blocks of 3 to 5 storeys stand around the Armenian Church. *(estimated)*

**Landmarks:** none on the shortlist; the area is read through its street character.

**Walking there, a player would see:** a congested junction with bus bays and kerbside stalls; buildings mostly 3 storeys (range 1 to 6); roofs mainly flat roof with water tank and hoardings (80 %) and tin-sheet or tiled shed roofs on old godowns (10 %); walls in aged lime wash #E4D7B8, ochre #D9B25F, grey concrete #B7B2A6, cream #EFE6D2. Street life: Heavy pedestrian crossings, buses, autos and handcarts. Signs: Tamil above English; banners and hoardings dominate the upper floors.

**OSM alone gives:** 548 building footprints (levels mapped on 87.2 %, roof shape on 0, colour tags on 0), street names and the 0 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the street furniture.

### Fort St George and Island Grounds

*Tamil (OSM, needs native review):* புனித ஜார்ஜ் கோட்டை / தீவு மைதானம் &nbsp; *Type:* colonial-institutional &nbsp; *Centre:* x 8175, z 568 (13.079888, 80.285582) &nbsp; *Boundary:* circle 550 m

- A walled colonial fort with 20-foot walls, now holding the state secretariat, a museum and the oldest Anglican church east of Suez.
- Beyond the walls lie the open Island Grounds and the Napier Bridge towards the Marina (both mapped in OSM).
- Low (1 to 3 storey) buildings and open lawns; very different from the dense city around it. *(estimated)*

**Landmarks:** Napier Bridge (B); Fort St. George (A); St. Mary's Church (A); Fort Museum (C); Tamil Nadu Government Legislature and Secretariat (B); Victory War Memorial (B).

**Walking there, a player would see:** calm internal roads between lawns; the outer ring is a busy arterial; buildings mostly 2 storeys (range 1 to 3); roofs mainly flat Madras terrace behind parapets (55 %) and pitched tile roof on barracks and church nave (25 %); walls in cream lime wash #EFE6D2, white #F3EEE3, ochre trim #D9B25F, red brick #A5502F. Street life: Visitors, school groups and office staff; heavy security at the secretariat gates. Signs: Government boards in Tamil first, English second; heritage plaques in English.

**OSM alone gives:** 192 building footprints (levels mapped on 14.1 %, roof shape on 0, colour tags on 0), street names and the 6 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 2 hero landmark(s).

### Park Town and Chennai Central

*Tamil (OSM, needs native review):* பூங்கா நகர் &nbsp; *Type:* colonial-institutional &nbsp; *Centre:* x 6747, z -175 (13.086573, 80.272393) &nbsp; *Boundary:* circle 600 m

- The red-brick Gothic and Romanesque railway terminus (1873, clock tower added later) anchors a district of hospitals and old halls.
- Wide roads cut through old compounds; tall hospital blocks stand beside low colonial halls. *(unverified)*
- Station forecourt crowds, porters, autos, share-cabs and buses give constant noise and movement. *(unverified)*

**Landmarks:** Chennai Central railway station (A); Ripon Building (A); Victoria Public Hall (B); Madras Medical College (C).

**Walking there, a player would see:** wide, busy trunk roads with flyovers; compounds set back behind walls; buildings mostly 3 storeys (range 1 to 8); roofs mainly flat roof with parapet (55 %) and pitched roofs with tiles or sheet on halls and sheds (25 %); walls in brick-red (station, repainted to original red in 2005 after a light-brown coat) #A5502F, cream trim #EFE6D2, white #F3EEE3, ochre #D9B25F. Street life: Heavy rail commuter and long-distance passenger flows. Signs: Tamil and English official boards; many Hindi travel notices near the station (unverified).

**OSM alone gives:** 580 building footprints (levels mapped on 14.3 %, roof shape on 1, colour tags on 1), street names and the 4 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 2 hero landmark(s).

### Egmore

*Tamil (OSM, needs native review):* எழும்பூர் &nbsp; *Type:* colonial-institutional &nbsp; *Centre:* x 5154, z 1353 (13.072832, 80.25769) &nbsp; *Boundary:* circle 750 m

- Home of the Indo-Saracenic red-brick railway terminus (1906 to 1908) and the Government Museum complex with the Connemara library.
- Around the institutions are low residential streets, schools and hospitals. *(estimated)*
- The institutions give long red-brick frontages with domes and arches.

**Landmarks:** Chennai Egmore railway station (A); Government Museum, Egmore (A); Connemara Public Library (B); National Art Gallery (Victoria Memorial Hall) (B); St. Andrew's Church (Kirk) (B).

**Walking there, a player would see:** broad Pantheon Road style avenues around the institutions, quiet side streets; buildings mostly 2 storeys (range 1 to 5); roofs mainly flat roof with parapet (58 %) and pitched tile roofs (20 %); walls in red brick #A5502F, cream #EFE6D2, white trim #F3EEE3, ochre #D9B25F. Street life: School groups at the museum, rail passengers, hospital visitors. Signs: Tamil first, English second on public boards.

**OSM alone gives:** 1,068 building footprints (levels mapped on 3.7 %, roof shape on 0, colour tags on 0), street names and the 5 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 2 hero landmark(s).

### Triplicane

*Tamil (OSM, needs native review):* திருவல்லிக்கேணி &nbsp; *Type:* temple-town &nbsp; *Centre:* x 7037, z 2732 (13.060429, 80.27507) &nbsp; *Boundary:* circle 650 m

- A dense old quarter beside the Marina where an ancient Vishnu temple and the Big Mosque (1795 per one source) stand a few lanes apart.
- Narrow lanes and long rows of boarding houses (locally 'mansions').
- Iyengar Brahmin and Muslim families live side by side in the same congested lanes.

**Landmarks:** Parthasarathy Temple (A); Wallajah Mosque (Big Mosque) (A); Amir Mahal (B); Chepauk Palace (Kalas Mahal) (A); M. A. Chidambaram Stadium (B); Senate House, University of Madras (B); Presidency College (B).

**Walking there, a player would see:** maze of narrow lanes and alleys, each with its own character; buildings mostly 2 storeys (range 1 to 5); roofs mainly flat roof with water tank, Madras terrace on older houses (70 %) and tiled sloping roofs on temple-street houses (20 %); walls in aged lime wash #E4D7B8, cream #EFE6D2, ochre #D9B25F, red oxide #A5502F. Street life: The many boarding houses earned Triplicane the name 'Bachelors Paradise' of Chennai. Signs: Tamil above English; Urdu lettering on some mosque-street shops (unverified).

**OSM alone gives:** 840 building footprints (levels mapped on 0.2 %, roof shape on 0, colour tags on 0), street names and the 7 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 3 hero landmark(s).

### Marina and Santhome

*Tamil (OSM, needs native review):* மறீனா கடற்கரை / சாந்தோம் &nbsp; *Type:* coastal &nbsp; *Centre:* x 7644, z 4666 (13.04304, 80.28068) &nbsp; *Boundary:* corridor 650 m either side of a 5-point spine

- A long straight beach promenade (conceived in 1884) with a wide road behind it, Indo-Saracenic university and college buildings on one side and memorial gardens and statues on the other.
- To the south at Santhome the Gothic basilica stands behind the beach road. *(estimated)*
- The sea edge is open sand, with kiosks, boats and sunrise and evening crowds. *(unverified)*

**Landmarks:** Marina Beach (B); Chennai (Marina) Lighthouse (B); M.G.R. Memorial and Anna Memorial (B); San Thome Cathedral Basilica (A); Shopping complex, Marina and Santhome (B); Marina Beach Market (B).

**Walking there, a player would see:** wide beach road with a service lane; the sand starts almost at the kerb; buildings mostly 2 storeys (range 1 to 5); roofs mainly flat roof with water tank (houses) (60 %) and tin and tiled roofs on fishing hamlets and kiosks (25 %); walls in salt-bleached white #F3EEE3, cream #EFE6D2, pale blue #C9D6EA, ochre #D9B25F. Street life: Statues of Tamil literary and political figures line the promenade (Gandhi, Thiruvalluvar, Bharathiyar, Annie Besant and others). Signs: Tamil first; many hand-painted stall signs.

**OSM alone gives:** 3,460 building footprints (levels mapped on 2.7 %, roof shape on 0, colour tags on 0), street names and the 6 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### Mylapore

*Tamil (OSM, needs native review):* மயிலாப்பூர் &nbsp; *Type:* temple-town &nbsp; *Centre:* x 6489, z 5933 (13.031647, 80.270016) &nbsp; *Boundary:* circle 500 m

- A temple town that grew around the Kapaleeshwarar Temple, its gopuram and its tank, with agraharam streets of pitched-roof houses facing the water.
- Heritage homes mix Tamil agraharam houses, neo-classical and Art Deco villas, with Margazhi kolams at the doorsteps in winter.
- The temple's festival processions and the Margazhi music season fill the lanes.

**Landmarks:** Kapaleeshwarar Temple (A); Kapaleeshwarar Temple Tank (B); Church of Our Lady of Light (Luz Church) (B).

**Walking there, a player would see:** temple car streets, 8 to 12 m wide, ring the tank; side lanes 3 to 5 m; buildings mostly 2 storeys (range 1 to 5); roofs mainly Madras terrace or concrete flat roof with water tank (52 %) and sloping tiled roofs facing the tank (agraharam) (35 %); walls in white #F3EEE3, cream lime #EFE6D2, ochre #D9B25F, temple red stripes #C8452E. Street life: Margazhi (mid-December to mid-January): kolams in front of every house and the music and dance season; the Mylapore Festival in January. Signs: Tamil first with English second; Sanskrit and Tamil verse on temple boards.

**OSM alone gives:** 606 building footprints (levels mapped on 0.2 %, roof shape on 0, colour tags on 0), street names and the 3 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### Mandaveli

*Tamil (OSM, needs native review):* மந்தைவெளி &nbsp; *Type:* suburban &nbsp; *Centre:* x 5706, z 6578 (13.025845, 80.262788) &nbsp; *Boundary:* circle 500 m

- A quiet residential grid south of Mylapore, close to the Adyar river, with the market streets around Mandaveli. *(unverified)*
- Low two to four storey houses, small apartment blocks and schools; the Mylapore atmosphere on a smaller scale. *(unverified)*
- Daily markets, coconut sellers and bicycle repair stalls. *(unverified)*

**Landmarks:** none on the shortlist; the area is read through its street character.

**Walking there, a player would see:** regular small streets, 5 to 8 m; buildings mostly 2 storeys (range 1 to 5); roofs mainly flat roof with water tank (72 %) and tiled roofs on old houses (20 %); walls in faded pink #F0C9C0, mint #BFD8D2, cream #EFE6D2, butter yellow #E8D9A8. Street life: Morning market, school traffic and two-wheelers. Signs: Tamil first, English second.

**OSM alone gives:** 495 building footprints (levels mapped on 0.2 %, roof shape on 2, colour tags on 0), street names and the 0 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the street furniture.

### Royapettah

*Tamil (OSM, needs native review):* ராயப்பேட்டை &nbsp; *Type:* old-commercial &nbsp; *Centre:* x 5835, z 3283 (13.055472, 80.26397) &nbsp; *Boundary:* circle 650 m

- A central residential and commercial quarter with the city's largest peripheral government hospital and a crowded main road.
- Mix of old Muslim and Christian community streets, mid-rise apartments and large retail buildings. *(unverified)*
- Less formal than neighbouring Mylapore; busy day and night. *(unverified)*

**Landmarks:** Royapettah Government Hospital (C); Shopping complex, Royapettah (B); Thousand Lights Mosque (B); Shopping complex, Royapettah (B).

**Walking there, a player would see:** a congested main road with side lanes; buildings mostly 3 storeys (range 1 to 8); roofs mainly flat roof with water tank and hoardings (78 %) and tiled or sheet roofs on older houses (17 %); walls in cream #EFE6D2, aged lime #E4D7B8, pale blue #C9D6EA, ochre #D9B25F. Street life: Hospital queues, small clinics, tea shops and mid-rise retail. Signs: Tamil above English.

**OSM alone gives:** 891 building footprints (levels mapped on 2.9 %, roof shape on 0, colour tags on 0), street names and the 4 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### T. Nagar (Thyagaraya Nagar)

*Tamil (OSM, needs native review):* not in OSM, unverified &nbsp; *Type:* dense-market &nbsp; *Centre:* x 2543, z 5160 (13.038595, 80.233579) &nbsp; *Boundary:* circle 1050 m

- A retail district: Ranganathan Street and Pondy Bazaar are among the most crowded shopping streets in the city, with big jewellery, textile and utensil stores in multi-storey blocks.
- Pavements are lined with hawkers (about 850 permanent street vendors were counted in a survey cited by a local magazine) and festival shopping fills the lanes.
- Buildings are tightly packed, 3 to 7 storeys, covered in hoardings and awnings; residential grids lie on the edges. *(estimated)*

**Landmarks:** Ranganathan Street (B); Panagal Park (C).

**Walking there, a player would see:** pedestrian-heavy, hawkers on both pavements; Pondy Bazaar is a wider commercial road; buildings mostly 4 storeys (range 1 to 8); roofs mainly flat roof with water tank, hoardings and rooftop signs (88 %) and tin or tile sheds on old houses (7 %); walls in weathered concrete grey #B7B2A6, cream #EFE6D2, ochre #D9B25F, pale blue #C9D6EA. Street life: Deepavali shopping crowds fill Ranganathan Street; about 850 permanent street vendors were counted on central pavements (a survey cited in a local magazine, probably dated). Signs: Tamil lettering large on top, English second; every shopfront covered in signs and awnings.

**OSM alone gives:** 4,769 building footprints (levels mapped on 1.6 %, roof shape on 5, colour tags on 0), street names and the 2 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Nungambakkam

*Tamil (OSM, needs native review):* நுங்கம்பாக்கம் &nbsp; *Type:* colonial-institutional &nbsp; *Centre:* x 3291, z 2550 (13.062063, 80.240487) &nbsp; *Boundary:* circle 550 m

- Central residential and institutional area with Loyola College's large campus and the Valluvar Kottam monument (both mapped in OSM).
- Principal lanes (College Road, Haddows Road, Sterling Road) are more than a century old and appear on a 1909 map.
- Quiet tree-lined streets with older bungalows and newer apartments, and busy commercial roads around them. *(unverified)*

**Landmarks:** St. George's Cathedral (B); Anna Flyover (Gemini flyover) (B); Valluvar Kottam (A); Loyola College (B).

**Walking there, a player would see:** tree-lined older streets with high compound walls; busy High Road; buildings mostly 3 storeys (range 1 to 12); roofs mainly flat roof with water tank (70 %) and hipped tile roofs on old bungalows (15 %); walls in white #F3EEE3, cream #EFE6D2, butter yellow #E8D9A8, sand #C9B48A. Street life: Embassies and consulates; college crowds along the main roads. Signs: English more prominent than in the old quarters; Tamil still first on shop boards.

**OSM alone gives:** 653 building footprints (levels mapped on 0.0 %, roof shape on 0, colour tags on 0), street names and the 4 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### Kodambakkam and Vadapalani

*Tamil (OSM, needs native review):* கோடம்பாக்கம் / வடபழனி &nbsp; *Type:* dense-market &nbsp; *Centre:* x 908, z 3789 (13.050926, 80.21848) &nbsp; *Boundary:* corridor 900 m either side of a 2-point spine

- The centre of the Tamil film industry, with studio compounds and film services in dense blocks.
- The Vadapalani Murugan Temple is an important pilgrimage centre.
- Busy bridges and 100 Feet Road junctions; bright cinema hoardings above flat-roofed blocks. *(unverified)*

**Landmarks:** Vadapalani Murugan Temple (B); Shopping complex, Kodambakkam and Vadapalani (B).

**Walking there, a player would see:** wide commercial roads with flyovers and tight side streets; buildings mostly 3 storeys (range 1 to 10); roofs mainly flat roof with water tank, hoardings (80 %) and studio sheds with sheet roofs (15 %); walls in weathered grey #B7B2A6, cream #EFE6D2, pale blue #C9D6EA, faded pink #F0C9C0. Street life: Pilgrim queues at the temple, film crews and extras, tea stalls. Signs: Tamil first with English; large hand-painted film banners.

**OSM alone gives:** 7,649 building footprints (levels mapped on 0.5 %, roof shape on 0, colour tags on 0), street names and the 2 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Anna Nagar

*Tamil (OSM, needs native review):* அண்ணா நகர் &nbsp; *Type:* planned-residential &nbsp; *Centre:* x -334, z -456 (13.089099, 80.207017) &nbsp; *Boundary:* corridor 1100 m either side of a 3-point spine

- Chennai's first planned neighbourhood, laid out for the 1968 World Trade Fair with an alphabetical grid of blocks, roundabouts, no dead ends and parks on every street.
- Rows of independent houses and low apartment blocks on wide streets, with a landmark 12-storey tower inside a park.
- Rated the second greenest part of the city, after Adyar, in a tree survey.

**Landmarks:** Anna Nagar Tower (A); Anna Nagar Arch (B); Koyambedu wholesale market (B); Shopping complex, Anna Nagar (B); Shopping complex, Anna Nagar (B); Shopping complex, Anna Nagar (B).

**Walking there, a player would see:** wide residential streets and avenue roads with roundabouts; buildings mostly 2 storeys (range 1 to 6); roofs mainly flat roof with water tank and a built-up staircase head (typical) (88 %) and pitched roofs on a few older houses (7 %); walls in faded pink #F0C9C0, mint #BFD8D2, pale blue #C9D6EA, butter yellow #E8D9A8. Street life: Adyar was rated the greenest part of the city and Anna Nagar second in a tree survey. Signs: Tamil first, English second; the commercial roads are heavier with English.

**OSM alone gives:** 12,782 building footprints (levels mapped on 0.2 %, roof shape on 1, colour tags on 1), street names and the 6 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### Kilpauk

*Tamil (OSM, needs native review):* கீழ்ப்பாக்கம் &nbsp; *Type:* colonial-institutional &nbsp; *Centre:* x 3020, z 198 (13.083215, 80.237986) &nbsp; *Boundary:* circle 700 m

- Once a garden-house suburb of British and wealthy Indian families; Rajah Sir Ramaswamy Mudaliar's estate became Kilpauk Garden.
- Today a semi-residential area with a medical college campus.
- Tree-lined roads, compound walls and mid-rise apartments replacing some of the old gardens. *(unverified)*

**Landmarks:** Kilpauk Water Works (B); Government Kilpauk Medical College (C).

**Walking there, a player would see:** leafy, quiet back streets and a busy Poonamallee High Road edge; buildings mostly 2 storeys (range 1 to 8); roofs mainly flat roof with water tank (62 %) and hipped tile roofs on garden houses (20 %); walls in white #F3EEE3, cream #EFE6D2, sand #C9B48A, brick #A5502F. Street life: Hospital visitors, college students, quiet residential evenings. Signs: Tamil first, English second.

**OSM alone gives:** 1,606 building footprints (levels mapped on 0.7 %, roof shape on 0, colour tags on 0), street names and the 2 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Purasawalkam

*Tamil (OSM, needs native review):* புரசைவாக்கம் &nbsp; *Type:* dense-market &nbsp; *Centre:* x 4867, z -481 (13.089328, 80.255033) &nbsp; *Boundary:* circle 950 m

- An ancient village (Chola era) that became a commercial hub, known especially for car traders.
- The first free-standing clock tower in Madras stood at the Doveton junction in the early 1900s.
- Old family streets and church compounds sit behind the busy main road. *(unverified)*

**Landmarks:** none on the shortlist; the area is read through its street character.

**Walking there, a player would see:** High Road congested; calm side lanes; buildings mostly 3 storeys (range 1 to 6); roofs mainly flat roof with water tank and signs (78 %) and tiled and sheet roofs on old houses and churches (17 %); walls in cream #EFE6D2, aged lime #E4D7B8, ochre #D9B25F, grey #B7B2A6. Street life: Textile and vehicle trade, church feasts, school crowds. Signs: Tamil first, English second.

**OSM alone gives:** 2,147 building footprints (levels mapped on 1.5 %, roof shape on 0, colour tags on 0), street names and the 0 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the street furniture.

### Perambur

*Tamil (OSM, needs native review):* பெரம்பூர் &nbsp; *Type:* suburban &nbsp; *Centre:* x 3457, z -3083 (13.112724, 80.242016) &nbsp; *Boundary:* circle 1500 m

- A working-class railway suburb: the carriage and locomotive workshops and the Integral Coach Factory are the anchors.
- Railway and labour colonies shaped the neighbourhood.
- Perambur railway station is the oldest in the city after Royapuram.

**Landmarks:** Integral Coach Factory (C).

**Walking there, a player would see:** grid colony streets, a busy main road, rail crossings; buildings mostly 2 storeys (range 1 to 5); roofs mainly flat roof with water tank (58 %) and sheet or tile roofs on railway quarters and workshops (32 %); walls in aged lime #E4D7B8, cream #EFE6D2, grey #B7B2A6, ochre #D9B25F. Street life: Shift-change crowds of rail workers; level-crossing queues. Signs: Tamil first, English second.

**OSM alone gives:** 7,154 building footprints (levels mapped on 0.1 %, roof shape on 0, colour tags on 3), street names and the 1 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Adyar

*Tamil (OSM, needs native review):* அடையாறு &nbsp; *Type:* suburban &nbsp; *Centre:* x 5164, z 8734 (13.00645, 80.257779) &nbsp; *Boundary:* circle 700 m

- A leafy south-central suburb at the mouth of the Adyar river, with the 100-hectare Theosophical Society grounds and its huge banyan.
- Old garden bungalows, schools and research institutes mixed with newer apartments. *(unverified)*
- Rated the greenest part of the city in a tree survey.

**Landmarks:** Theosophical Society grounds and the Great Banyan (A); Elphinstone Bridge (B); Broken Bridge (Adyar) (B).

**Walking there, a player would see:** quiet leafy roads, some wider arterial roads; buildings mostly 2 storeys (range 1 to 6); roofs mainly flat roof with water tank (68 %) and hipped tile roofs on bungalows (17 %); walls in white #F3EEE3, cream #EFE6D2, butter yellow #E8D9A8, sand #C9B48A. Street life: Joggers and cyclists, students from research institutes and colleges. Signs: English slightly more common than in old quarters; Tamil first on shop boards.

**OSM alone gives:** 1,169 building footprints (levels mapped on 1.5 %, roof shape on 0, colour tags on 0), street names and the 3 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### Besant Nagar and Elliot's Beach

*Tamil (OSM, needs native review):* பெசன்ட் நகர் &nbsp; *Type:* coastal &nbsp; *Centre:* x 6296, z 9486 (12.99969, 80.268226) &nbsp; *Boundary:* circle 700 m

- A seaside neighbourhood with a wide beach (Elliot's Beach), the Ashtalakshmi Temple and a Marian shrine near the shore (all mapped in OSM).
- Rows of low houses and apartment blocks sit behind the beach road. *(estimated)*
- Evening walks and sea breeze; salt-weathered paint. *(unverified)*

**Landmarks:** Ashtalakshmi Temple (A); Annai Velankanni Shrine (B); Elliot's Beach (B).

**Walking there, a player would see:** wide beach road, regular residential grid; buildings mostly 2 storeys (range 1 to 8); roofs mainly flat roof with water tank (80 %) and tin and tile roofs on small shops and fishing houses (15 %); walls in salt-bleached white #F3EEE3, pale blue #C9D6EA, mint #BFD8D2, butter yellow #E8D9A8. Street life: Evening beach crowds, food stalls, horse rides; Sunday family outings. Signs: Tamil first with more English on cafe boards.

**OSM alone gives:** 1,100 building footprints (levels mapped on 5.7 %, roof shape on 0, colour tags on 0), street names and the 3 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### Guindy

*Tamil (OSM, needs native review):* கிண்டி &nbsp; *Type:* colonial-institutional &nbsp; *Centre:* x 1112, z 8483 (13.00871, 80.220364) &nbsp; *Boundary:* circle 700 m

- Guindy National Park, one of the few national parks inside a city, shares a fence with Raj Bhavan and IIT Madras.
- To the west the Kathipara interchange and the industrial estate (the first in independent India, 1958) make it a major junction.
- Mix of forest edge, campus buildings, colonial residences and industrial sheds. *(unverified)*

**Landmarks:** Guindy National Park (B); Raj Bhavan (Guindy Lodge) (B); Kathipara Interchange (A); Gandhi Mandapam (B); Indian Institute of Technology Madras (C); St. Thomas Mount shrine (B).

**Walking there, a player would see:** wide roads at the interchange; forest-edge roads quiet and tree-shaded; buildings mostly 2 storeys (range 1 to 10); roofs mainly flat roof with water tank (55 %) and sheds and campus pitched roofs (25 %); walls in white #F3EEE3, cream #EFE6D2, sand #C9B48A, brick #A5502F. Street life: Deer and blackbuck in the park; students; heavy interchange traffic at Kathipara. Signs: Tamil first on public boards, English heavy in the industrial and campus part.

**OSM alone gives:** 505 building footprints (levels mapped on 6.3 %, roof shape on 0, colour tags on 0), street names and the 6 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### Saidapet

*Tamil (OSM, needs native review):* சைதாப்பேட்டை &nbsp; *Type:* suburban &nbsp; *Centre:* x 1500, z 7137 (13.020817, 80.223954) &nbsp; *Boundary:* circle 700 m

- A dense old southern gateway on the Adyar river, crossed by a bridge first built in the 1720s and rebuilt in 1966.
- Its landmarks include the Karaneeswarar Temple and the Little Mount shrine.
- Low and mid-rise concrete blocks, small shops and a river-edge market. *(unverified)*

**Landmarks:** Maraimalai Adigal Bridge (Marmalong Bridge) (B); Karaneeswarar Temple (B).

**Walking there, a player would see:** busy main road, bus bays at the bridge end, lanes behind; buildings mostly 2 storeys (range 1 to 5); roofs mainly flat roof with water tank (72 %) and tin and tile roofs on old lanes (23 %); walls in aged lime #E4D7B8, cream #EFE6D2, pale blue #C9D6EA, ochre #D9B25F. Street life: Fish and vegetable market, temple festivals, bus changeovers. Signs: Tamil first, English second.

**OSM alone gives:** 2,122 building footprints (levels mapped on 1.4 %, roof shape on 0, colour tags on 0), street names and the 2 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Velachery

*Tamil (OSM, needs native review):* வேளச்சேரி &nbsp; *Type:* suburban &nbsp; *Centre:* x 1172, z 11980 (12.977261, 80.220918) &nbsp; *Boundary:* circle 1750 m

- A large southern suburb next to the Pallikaranai marsh.
- It floods almost every northeast-monsoon season because the marsh has shrunk to under a tenth of its size.
- Wide commercial roads, a rail terminus, malls and many mid-rise apartments. *(unverified)*

**Landmarks:** Pallikaranai Marsh (B); Shopping complex, Velachery (B); Shopping complex, Velachery (B); Shopping complex, Velachery (B).

**Walking there, a player would see:** wide arterial roads with narrow residential lanes; drains and culverts; buildings mostly 3 storeys (range 1 to 12); roofs mainly flat roof with water tank and solar heaters (88 %) and sheet roofs on older lanes (10 %); walls in faded pink #F0C9C0, mint #BFD8D2, pale blue #C9D6EA, butter yellow #E8D9A8. Street life: Commuters to the OMR offices, auto stands at the rail terminus, flooded streets in the monsoon. Signs: Tamil first, English second; English heavy near the malls.

**OSM alone gives:** 9,300 building footprints (levels mapped on 0.5 %, roof shape on 6, colour tags on 5), street names and the 4 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Tambaram

*Tamil (OSM, needs native review):* தாம்பரம் &nbsp; *Type:* suburban &nbsp; *Centre:* x -10294, z 17844 (12.924528, 80.115052) &nbsp; *Boundary:* circle 2200 m

- A southern satellite town with the Madras Christian College campus (deer and old trees) and an air force station nearby.
- Dense market streets near the station and a ring of apartment blocks and layouts around it. *(unverified)*
- Terminal station of the first electrified suburban line (1931).

**Landmarks:** Madras Christian College (B); Tambaram railway station (C).

**Walking there, a player would see:** GST Road is a busy trunk road; lanes behind are narrow; buildings mostly 2 storeys (range 1 to 8); roofs mainly flat roof with water tank (70 %) and sheet and tile roofs (25 %); walls in cream #EFE6D2, aged lime #E4D7B8, white #F3EEE3, pale blue #C9D6EA. Street life: Commuter crowds at the station, share autos and buses on the GST Road. Signs: Tamil first, English second.

**OSM alone gives:** 10,614 building footprints (levels mapped on 0.3 %, roof shape on 0, colour tags on 0), street names and the 2 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Pallavaram, Meenambakkam and the airport

*Tamil (OSM, needs native review):* பல்லாவரம் / மீனம்பாக்கம் &nbsp; *Type:* airport &nbsp; *Centre:* x -5421, z 11409 (12.982399, 80.160047) &nbsp; *Boundary:* corridor 1800 m either side of a 3-point spine

- Chennai International Airport (aerodrome polygon 5.9 km2) sits between Meenambakkam and Tirusulam with terminals T1, T2 and T4, runways and taxiways.
- Pallavaram is an old town with a hill and a lake; both sides have dense low-rise housing under the flight path. *(estimated)*
- Passenger operations moved to the Tirusulam terminals in 1985 (domestic) and 1989 (international).

**Landmarks:** Chennai International Airport terminals (A); Pallavaram Lake (B); Shopping complex, Pallavaram, Meenambakkam and the airport (B); Shopping complex, Pallavaram, Meenambakkam and the airport (B).

**Walking there, a player would see:** airport approach roads and flyovers; narrow residential lanes under the flight path; buildings mostly 2 storeys (range 1 to 6); roofs mainly flat roof with water tank (70 %) and sheet and tile roofs, workshops (22 %); walls in cream #EFE6D2, white #F3EEE3, grey #B7B2A6, pale blue #C9D6EA. Street life: Taxis and share cabs at the arrival forecourts; aircraft low over the roofs. Signs: English and Tamil bilingual airport boards; Hindi added on terminal signs (unverified).

**OSM alone gives:** 12,846 building footprints (levels mapped on 0.2 %, roof shape on 0, colour tags on 0), street names and the 4 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 1 hero landmark(s).

### OMR and Sholinganallur IT corridor

*Tamil (OSM, needs native review):* சோழிங்கநல்லூர் &nbsp; *Type:* IT-corridor &nbsp; *Centre:* x 2365, z 20304 (12.902398, 80.231935) &nbsp; *Boundary:* corridor 1400 m either side of a 6-point spine

- Old Mahabalipuram Road (Rajiv Gandhi Salai) is the city's IT corridor, with tech parks and SEZs from Perungudi and Thoraipakkam through Sholinganallur.
- Glass and concrete office campuses stand behind boundary walls; apartment towers fill the gaps. *(unverified)*
- A wide road with metro construction and service roads; very different from the old city.

**Landmarks:** IT park, Perungudi (name withheld) (B); State IT SEZ campus, Sholinganallur (B); Shopping complex, OMR and Sholinganallur IT corridor (B); Shopping complex, OMR and Sholinganallur IT corridor (B); Shopping complex, OMR and Sholinganallur IT corridor (B).

**Walking there, a player would see:** a six-lane arterial with service lanes and flyovers; campuses behind walls; buildings mostly 4 storeys (range 1 to 25); roofs mainly flat roof with plant rooms and water tanks (90 %) and industrial shed roofs (5 %); walls in glass blue-grey #8FA9B8, aluminium cladding #C5CED3, concrete #B7B2A6, white #F3EEE3. Street life: Shuttle buses, cabs and two-wheelers at shift change; tea stalls at campus gates. Signs: English more common than Tamil on campus and project boards; Tamil boards on village shops.

**OSM alone gives:** 17,711 building footprints (levels mapped on 0.6 %, roof shape on 0, colour tags on 5), street names and the 5 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Ennore and North Chennai port

*Tamil (OSM, needs native review):* எண்ணூர் &nbsp; *Type:* port-industrial &nbsp; *Centre:* x 13222, z -19627 (13.261506, 80.332173) &nbsp; *Boundary:* corridor 2200 m either side of a 3-point spine

- A thermal power, port and industrial belt around Ennore Creek: Kamarajar Port (commenced 22 June 2001), thermal stations and the Kattupalli shipyard to the north.
- Coal yards, thermal stations and ports line the creek, with salt marsh and abandoned salt pans on its western edges.
- Fishing villages and low houses are squeezed between the plants. *(unverified)*

**Landmarks:** Kamarajar Port (B); Ennore Thermal Power Station (B); Ennore Creek (B).

**Walking there, a player would see:** wide industrial roads with heavy trucks; village lanes are narrow; buildings mostly 1 storeys (range 1 to 6); roofs mainly flat roofs on offices and houses (40 %) and sheet-metal industrial roofs (35 %); walls in industrial grey #9C9890, concrete #B7B2A6, blue sheet cladding #5E7C8A, green sheet cladding #7B9A6B. Street life: Coal trucks and container lorries; fishing boats at the creek. Signs: English and Tamil on gate boards; safety notices in English.

**OSM alone gives:** 2,295 building footprints (levels mapped on 0.2 %, roof shape on 0, colour tags on 0), street names and the 3 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Ambattur Industrial Estate

*Tamil (OSM, needs native review):* அம்பத்தூர் தொழிற்பேட்டை &nbsp; *Type:* port-industrial &nbsp; *Centre:* x -4228, z -1098 (13.094876, 80.171067) &nbsp; *Boundary:* circle 1500 m

- A large small-scale industrial estate (about 1.9 km2 in OSM) commissioned in the early 1960s, known for auto-ancillary units.
- A grid of numbered streets lined with one to three storey workshops and sheds with sheet roofs. *(unverified)*
- The area moved from farmland and mango groves to manufacturing.

**Landmarks:** Ambattur Industrial Estate (C); Shopping complex, Ambattur Industrial Estate (B).

**Walking there, a player would see:** regular grid of numbered streets with trucks parked on both sides; buildings mostly 1 storeys (range 1 to 5); roofs mainly sheet-metal and asbestos-style pitched sheds (single slope or saw-tooth) (40 %) and gabled sheet roofs (30 %); walls in industrial grey #9C9890, concrete #B7B2A6, aged lime #E4D7B8, blue sheet cladding #5E7C8A. Street life: Shift-change crowds on two-wheelers, tea stalls and small lorries. Signs: English and Tamil on works boards; many hand-painted unit names.

**OSM alone gives:** 4,071 building footprints (levels mapped on 0.2 %, roof shape on 0, colour tags on 0), street names and the 2 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Thiruvanmiyur

*Tamil (OSM, needs native review):* திருவான்மியூர் &nbsp; *Type:* coastal &nbsp; *Centre:* x 5883, z 11020 (12.985895, 80.264421) &nbsp; *Boundary:* circle 800 m

- A largely residential south Chennai neighbourhood beside the sea, with the Marundeeswarar temple close to the beach.
- The beach is a turtle habitat and the railway station is opposite an IT park.
- Low houses and apartments between the temple streets and the beach road. *(unverified)*

**Landmarks:** Marundeeswarar Temple (B).

**Walking there, a player would see:** temple streets and wide beach and arterial roads; buildings mostly 2 storeys (range 1 to 7); roofs mainly flat roof with water tank (75 %) and tile and sheet roofs (20 %); walls in white #F3EEE3, pale blue #C9D6EA, mint #BFD8D2, butter yellow #E8D9A8. Street life: Beach morning walkers, temple visitors, IT commuters. Signs: Tamil first, English second.

**OSM alone gives:** 1,074 building footprints (levels mapped on 2.3 %, roof shape on 0, colour tags on 0), street names and the 1 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Chetpet

*Tamil (OSM, needs native review):* சேத்துப்பட்டு &nbsp; *Type:* suburban &nbsp; *Centre:* x 3650, z 1474 (13.071745, 80.243797) &nbsp; *Boundary:* circle 550 m

- A compact central residential area with Chetpet Lake and its eco park, mapped as a 3.4 ha lake in OSM.
- The name is disputed: either a marshy place (chetru pattu) or from a contractor who owned many houses.
- Quiet roads with apartment blocks and schools. *(unverified)*

**Landmarks:** Chetpet Lake (B).

**Walking there, a player would see:** lake-edge road and residential grid; buildings mostly 2 storeys (range 1 to 6); roofs mainly flat roof with water tank (76 %) and hipped tile roofs (12 %); walls in cream #EFE6D2, white #F3EEE3, butter yellow #E8D9A8, sand #C9B48A. Street life: Lake-side walkers and school traffic. Signs: Tamil first, English second.

**OSM alone gives:** 711 building footprints (levels mapped on 0.4 %, roof shape on 0, colour tags on 0), street names and the 1 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Chengalpattu

*Tamil (OSM, needs native review):* செங்கல்பட்டு &nbsp; *Type:* rural-edge &nbsp; *Centre:* x -24528, z 44579 (12.684088, 79.983637) &nbsp; *Boundary:* circle 1600 m

- The district headquarters town about 56 km from Chennai on the Palar river and the GST Road, with a Vijayanagara-era fort and the large Kolavai lake.
- Low market-town buildings, temple streets and growing apartment edges; paddy and scrub land begins at the edge. *(unverified)*
- The world data keeps only 55 buildings here (ring 3 keeps roads, not houses).

**Landmarks:** Kolavai Lake (B).

**Walking there, a player would see:** main road with a market, quieter lanes; buildings mostly 1 storeys (range 1 to 3); roofs mainly flat roof with water tank (50 %) and tiled roofs (40 %); walls in cream #EFE6D2, aged lime #E4D7B8, butter yellow #E8D9A8, pale blue #C9D6EA. Street life: Bus stand crowds, weekly market, paddy fields at the edge. Signs: Tamil boards, English minor.

**OSM alone gives:** 55 building footprints (levels mapped on 0.0 %, roof shape on 0, colour tags on 0), street names and the 1 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

### Pulicat and the northern lagoon edge

*Tamil (OSM, needs native review):* புலிகட் / பழவேற்காடு &nbsp; *Type:* rural-edge &nbsp; *Centre:* x 11542, z -36990 (13.41766, 80.31667) &nbsp; *Boundary:* circle 1500 m

- A lagoon-edge fishing town with a Dutch fort ruin (Fort Geldria, Dutch Coromandel capital), a Dutch cemetery and an old church.
- The Pulicat lake is a shallow lagoon with a bird sanctuary (flamingos in the cold months).
- Tiny settlement: low tiled and sheet-roof houses between mangroves and casuarina. *(unverified)*

**Landmarks:** Fort Geldria (Pulicat) (B); Dutch Cemetery, Pulicat (B); Pulicat Lighthouse (B); Our Lady of Glory church, Pulicat (B).

**Walking there, a player would see:** village lanes and a causeway road; buildings mostly 1 storeys (range 1 to 2); roofs mainly thatched, tiled and sheet roofs on fishing houses (65 %) and flat concrete roofs on newer houses (30 %); walls in cream #EFE6D2, salt white #F3EEE3, pale blue #C9D6EA, ochre #D9B25F. Street life: Boating on the lagoon is offered by the local fishing villages, and a Flamingo Festival is held around December to January. Signs: Tamil boards; few signs overall.

**OSM alone gives:** 24 building footprints (levels mapped on 0.0 %, roof shape on 1, colour tags on 0), street names and the 4 shortlisted landmark outlines. **Needs modelling:** wall colour and finish, roof form and water tanks, storeys beyond the mapped few, signage and awnings, street trees, and the 0 hero landmark(s).

## Shopping complexes and markets

Malls are businesses, so their names are withheld in game data (TD-18): each entry is called 'Shopping complex, <area>' and its sign reads `வணிக வளாகம் / SHOPPING COMPLEX`. The name used only to find the OSM object sits in a `research_name` field marked research only. Found by scanning the extract for every `shop=mall` and every `building=retail` or `commercial` of 8,000 m2 or more or five levels or more, then keeping shopping buildings and dropping office and IT blocks.

| Entry | Area | Levels (OSM) | Footprint m2 | OSM |
|---|---|---:|---:|---|
| Shopping complex, Royapettah | royapettah | untagged | 16,961 | way/154030370 |
| Shopping complex, Anna Nagar | anna-nagar | 6 | 27,788 | way/634144271 |
| Shopping complex, Royapettah | royapettah | 7 | 18,586 | way/1128509238 |
| Shopping complex, OMR and Sholinganallur IT corridor | omr-sholinganallur | 10 | 11,496 | way/1040126396 |
| Shopping complex, Velachery | velachery | 4 | 18,689 | relation/15321422 |
| Shopping complex, Kodambakkam and Vadapalani | kodambakkam-vadapalani | 5 | 13,698 | way/355637768 |
| Shopping complex, Anna Nagar | anna-nagar | 6 | 9,116 | way/1534023217 |
| Shopping complex, Marina and Santhome | marina-santhome | untagged | 11,162 | way/29267290 |
| Shopping complex, Anna Nagar | anna-nagar | untagged | 11,059 | way/393560243 |
| Shopping complex, OMR and Sholinganallur IT corridor | omr-sholinganallur | untagged | 10,316 | way/634538011 |
| Shopping complex, Pallavaram, Meenambakkam and the airport | pallavaram-meenambakkam-airport | 7 | 8,656 | way/1061239868 |
| Shopping complex, Velachery | velachery | untagged | 7,898 | way/1132414645 |
| Shopping complex, Ambattur Industrial Estate | ambattur-industrial | untagged | 6,336 | way/1544754962 |
| Shopping complex, OMR and Sholinganallur IT corridor | omr-sholinganallur | untagged | 4,476 | way/1373636316 |
| Shopping complex, Velachery | velachery | untagged | 3,540 | way/396824231 |
| Shopping complex, Pallavaram, Meenambakkam and the airport | pallavaram-meenambakkam-airport | 7 | 3,841 | way/1559399089 |

Old-town shopping streets and markets on the shortlist: Ranganathan Street, Mint Street, Sowcarpet and Flower Bazaar, Marina Beach Market, Koyambedu wholesale market. Pondy Bazaar has no object of its own in OSM (see `not_found_in_osm`). Architecture details are sourced only where a page was read (a rebuilt 1980s complex with parking for 800 cars, a 2013 mall, a six-floor mall); everything else is `unverified`.

## Method and limits

- Centres and boundaries come from the game's own district data (`src/game_world/district_index.gd` points in the world tiles) and OSM place nodes; radii are half the distance to the nearest other area centre (clamped 450 to 2200 m) or set from an OSM polygon, corridors follow district points along OMR, the Marina, the airport axis and the Ennore port. They are meant for assigning buildings to palettes, not for administrative borders.
- Landmarks were found in `data/raw/world.osm.pbf` (the world extract) with `tools/geo/chennai_geo/area_lookup.py` (pyosmium, no Overpass), then the best candidate per name was checked by hand against tags and position. Brand-named buildings keep only their OSM id and a generic name.
- Wikimedia Commons file titles and licences come from the Commons API; titles are filtered to free licences and to words from the landmark's name. Eighteen landmarks have no matching file; that is stated, not guessed. Images are never stored in the repository.
- Wikipedia and other page text was paraphrased (CC BY-SA 4.0 for Wikipedia, which asks for attribution: the source URLs in `areas.json` and `landmarks_shortlist.json` serve as the credit).
- Fields that are not claims (tier reason, style, kit parameters, street feel, roof variants, signage mix, boundaries) are modelling notes or derived geometry; the claims beside them carry the sources.
- `unverified` means general knowledge that no read source supported. Do not show it in the game as fact.

## Using the data

- Palettes: `data/areas/palettes.json` (see `palettes.schema.json`), derived by `python -m chennai_geo.area_palettes`. Per area id: `walls` and `roofs` (hex), `roof_types` (world roof-shape names to weights), `storeys` (bins 1, 2, 3, 4-5, 6-9, 10+ to weights) and the `boundary`; `default` for buildings outside every area.
- Landmark pipeline: tiers and kit parameters in `landmarks_shortlist.json` (`tier.params`), OSM id and footprint in `osm`.
- Regenerate coverage with `python -m chennai_geo.area_coverage` (needs the world and the PBF); tests in `tools/geo/tests/test_areas_data.py` keep the schema, the claim rules and the palettes in step.
