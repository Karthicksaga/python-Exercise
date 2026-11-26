# Chennai culture and life: Tamil and English, temple visits, swimming, riding

Date: 24 Nov 2026. Status: proposed (owner's direction, design not built yet).
Owner's direction: Tamil and English are the game's languages and signs; bring in legacy Chennai
culture; the player can visit temples such as Kapaleeshwarar Koil with real integrity and detail, can
devote (pray), swim, ride, and do everything a person in the city does.

## 1. Language: Tamil first, English beside it

- **Signs on the street:** Tamil on top and English below, the way Tamil Nadu signs are written. Landmark
  and public-place signs use the real names; shops use the category word (cloth, grocery, flowers, tea)
  in both languages, never a real business name (TD-18).
- **The game's text:** every string goes through Godot's translation system (`tr()` keys, one file per
  language). Languages: English and Tamil. A setting chooses the main language; Tamil is the default
  display font stack (Noto Sans Tamil, SIL OFL, already being added by the title-screen agent).
- **Content to translate:** menus, HUD, the 21 stages, 13 jobs, 5 new missions, toasts, controls guide,
  place facts. The missions and facts are written in English first; Tamil is written by Claude and
  **must be reviewed by a native Tamil speaker** before release (the owner or a friend). Machine Tamil is
  never shipped unreviewed.
- **Test:** a test fails if any `tr()` key is missing in either language, and a screenshot test shows
  Tamil glyphs, not boxes, at 915x412 and 1830x824, including long Tamil words that wrap.

## 2. Legacy Chennai, as things to find and learn

A **Heritage journal** collects what the player visits and learns, each with a short bilingual fact
card written from public sources (links in the card) and the OSM position of the place:
Kapaleeshwarar Temple and its tank, Santhome Basilica, Fort St George, Ripon Building, Chennai Central
and Egmore stations, Madras High Court, Marina Beach and its lighthouse, Valluvar Kottam, the Mylapore
mada streets, Elliot's Beach, the Buckingham Canal.
Everyday heritage too: kolam designs drawn at doorsteps at dawn, jasmine and flower sellers, filter
coffee stalls, sundal on the beach, the Margazhi music season in December, Pongal. These are places and
small activities, not collectibles to grind.

## 3. Visiting a temple (Kapaleeshwarar Koil as the first, built as a vertical slice)

What the visit contains, in the order a visitor does it:
1. **Approach** along the real temple streets, the tank on one side, flower and coconut sellers outside.
2. **Footwear stand** at the gopuram: the player leaves their sandals (a real part of the visit); walking
   in socks or barefoot changes the footstep sound.
3. **Inside the walls:** the gopuram passage, the pillared mandapam, the prakaram (the walkway round the
   shrine), lamps, a flagstaff and a bell. Quiet ambient sound (bells, temple drum at set hours, murmur).
4. **Things to do:** buy flowers or a coconut, light a lamp, ring the bell, walk the prakaram clockwise
   (pradakshina), stand with folded hands (anjali) at the sanctum doorway, receive prasadam (for example
   pongal or sundal) from an attendant, put a coin in the hundi.
5. **Learn:** a facts card for the temple (gopuram about 37 m with seven tiers, the tank, the festival
   chariot) in Tamil and English, filed in the Heritage journal.

Rules the temple follows, as design decisions for the owner to confirm:
- **Peace zone:** no weapons, fighting, running, horn or wanted level inside the walls; crowds stay calm.
- **Respect:** the sanctum is shown as a lit doorway and curtain with lamps. No deity images or models are
  made; worship is shown as the visitor's quiet actions only. No jokes, no scoring of devotion; the
  reward for a visit is calm (a small health and stamina recovery) and a journal entry.
- **No swimming or bathing in temple tanks.** The player can walk the steps and watch the water; the game
  does not let them enter it.
- **Dress and footwear** are shown, not enforced with a fine.
- **Children:** none close to the player in any scene where they could be hurt; families visit as groups
  with adults, as in the rest of the game (existing rule).
- **Other faiths** get the same care when we add them (Santhome Basilica, mosques).

## 4. Swimming

Today water is blocked at the bank (G-152): nobody can enter it. Swimming therefore needs a new rule and a
new controller:
- **Where:** only in **swim zones** the game marks: designated sea shallows with lifeguard flags (such as
  Elliot's Beach), public pools, and lakes where swimming is normal. Everywhere else stays blocked. Marina
  Beach is shown with warning flags and is wade-only (the real beach has strong currents).
- **How:** a swim state on the player controller: buoyancy, a stamina bar, slower movement, a camera that
  sits low, splash and underwater sound, a swim idle and a swim stroke clip. The CC0 animation library
  already used for walking probably has swim loops (to verify); otherwise authored in Blender.
- **Touch controls:** the same stick moves; the action button dives or exits; stamina shown; safe by
  default (reaching zero stamina floats the player back to shore, no death).
- **Phone cost:** a water volume with a cheap surface, no reflections (as already done).

## 5. Riding

Already driveable: motorbike, auto, share auto, goods carrier, cars, buses, ambulance (premium cars and a race car modelled). To add, in order of value:
1. **Bicycle** (the cast already has cyclists): lean, balance-free arcade handling, a bell, rides along the Marina promenade.
2. **Boat** on the Buckingham Canal and the Adyar / Cooum where wide enough, as a short ride and a way to see the city.
3. **Train and Metro** as rider scenes (already planned for phase 6): board, sit, look out, alight.
4. **Pony rides on the beach** are a real Marina tradition; they would be adult rides only, if included at all, and only if the owner wants them.

## 6. Order of work (after the landmark pipeline and OSM detail pass already started)

1. **Language system:** translation keys, Tamil and English files, bilingual signs, font fallbacks, tests. (godot-standard)
2. **Temple visit vertical slice at Kapaleeshwarar:** the model upgrade from the landmark pipeline, the footwear stand, prakaram, lamp, bell, prasadam, journal card, peace zone, ambient sound, interaction states. (godot-complex for the state machine and the peace-zone rules; godot-standard for content and UI)
3. **Heritage journal and place facts** for the first ten landmarks. (godot-standard; Tamil text reviewed by a native speaker)
4. **Swimming:** swim zones in the data, the swim controller, clips, sounds, touch controls. (godot-complex)
5. **Bicycle and boat.** (godot-complex for handling, godot-standard for models)

## 7. Open decisions for the owner

1. Is the peace-zone and respect list in section 3 right, and is there anything you want added or changed?
2. Which place should be second after Kapaleeshwarar: Santhome Basilica, the Marina, or Fort St George?
3. Who reviews the Tamil text before release?
4. Do you want beach pony rides in the game, or not?
