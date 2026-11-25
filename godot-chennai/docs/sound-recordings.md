# Sounds: what is real, what is synthetic, and what to record on a phone

Decisions G-370 to G-379 (`technical-decisions.md`). The sound files, their sources and licences
are in `assets/audio/manifest.json` and `assets/LICENSES.md`; the credits for CC-BY recordings
are on the ABOUT page (`SoundCredits`). Tools: `tools/audio/` (`fetch_commons.py`,
`import_recordings.py`, `synth_extras.py`, `measure_manifest.py`, tests `test_audio_files.py`).

## What is real and what is synthetic (25 Nov 2026)
| Sound | State | Source |
|---|---|---|
| Car engine, start and stop; crickets, rain, three crows, four stone footsteps | Real (before this work) | NSU Prinz (CC BY 4.0), OpenGameArt (CC0) |
| `bell.temple` (a far temple bell) | **Real** | Bonsyou5599.ogg, Jnn, Wikimedia Commons, CC BY 2.1 jp |
| `rail.horn.emu`, `rail.door.chime`, `rail.door.open`, `rail.door.close`, `rail.announce`, `rail.rumble`, `rail.clatter`, `rail.squeal`, `crossing.bell`, `crossing.boom`, `bus.airbrake`, `bed.market`, `bed.tea` | **Synthetic** (`tools/audio/synth_extras.py`) | none found that could be downloaded, see below |
| Engines: auto, share auto (same), bike, thumper, bus, ambulance, goods; horns of auto, bike, thumper, bus, goods; the bus door | Synthesised stand-ins (G-81), unchanged | |
| `bed.city`, `bed.sea`, koel, sirens, wind, skid, crashes, gear clunk, interface cues | Synthesised stand-ins, out of this task | |

Wikimedia Commons answered every download after the first three with HTTP 429 and
`Retry-After: 600` (retried every ten minutes for more than an hour; the limit is on files its edge
has not cached, shared by every user of the same address). Candidates that were found and licence-checked on Commons and are ready to cut
once the limit lifts (add the pieces to `recordings.json`, run `fetch_commons.py` then the importer):
`Level crossing Belgium 2022.ogg` (CC0) for the bell; `The horn of a Bluebird railcar.ogg` (CC0) and
`OER 5200 Chime Door open and close.ogg` (public domain) for the EMU horn and doors; `WWS Level-crossingbarrier8211Lifting.ogg`
(CC BY 4.0) for the boom; `WWS CityBusMANSG220engine.ogg`, `…horn.ogg`, `…dooropeningclosing.ogg` (CC BY 4.0) for the bus;
`Pulsar2.ogg` (CC BY 3.0, an Indian 150 cc single) for the bike; `WWS FSRTarpan239Dvandriving.ogg` and `WWS TractorUrsusC-45.ogg`
(CC BY 4.0) for the ambulance and the goods carrier; `USSR bicycle 2T engine D-4.wav` (public domain) and `WWS MotorcycleTOMOSD-9.ogg`
(CC BY 4.0), two-stroke singles, for the auto (they need `speed` retuning: two-stroke idle is about twice the game's four-stroke auto).
Downloaded and analysed but not used: `Jawa250/350 motorbike exhaust sound.ogg` (public domain): revving and gear changes
only (no idle, firing note 37 to 80 Hz), so they cannot make a thumper that idles at 8 Hz.
Nothing here has been listened to by a person: the loops, levels and clicks are measured, the sound is not judged.

## How a recording gets in
1. Find a CC0, public-domain or CC-BY file (never -SA, -NC, -ND). Wikimedia Commons: its API and
   `upload.wikimedia.org` answer HTTP 429 with `Retry-After: 600` after about three downloads from
   this network; `fetch_commons.py` waits that out, so a run takes about ten minutes per three files.
   OpenGameArt answers without a limit. The Internet Archive, Freesound, BBC and others are blocked
   by the network policy here (HTTP 403 from the proxy).
2. Add the cut to `tools/audio/recordings.json` (start, length, what; engine loops also the band of
   the firing note; `speed` to resample, `highpass` to remove an offset).
3. `python3 tools/audio/import_recordings.py --cache <dir>` trims, finds the loop period, crossfades
   the wrap, normalises (-16 LUFS, peak at most -2.2 dBFS; engine and horn replacements match the
   stand-in's RMS so the mix keeps its balance), writes mono Ogg Vorbis (engine loops WAV), and
   writes the manifest and LICENSES rows. `python3 tools/audio/synth_extras.py` makes the synthetic
   ones. `python3 tools/audio/measure_manifest.py` stores the measurements the tests check.
4. `godot --headless --path . --import`, `./run_tests.sh --filter=sound`.

## Replace with your own phone recordings
A phone recording of the real thing beats everything here. Record in landscape-quiet conditions,
mono is fine, WAV or high-quality m4a, no music, no talking. Name each file by the id; drop them in
a folder and ask for them to be imported (the tools above do the trimming and looping).

| Id | What to record | Length |
|---|---|---|
| `rail.horn.emu` | A suburban EMU's horn from the platform, one press, no train noise over it | 3 s |
| `rail.rumble` | Inside a moving EMU, standing near the door, steady speed | 20 s |
| `rail.clatter` | Same, on a stretch with rail joints, about 40 km/h (the game plays it at 20 m/s) | 20 s |
| `rail.squeal` | A train braking into a station seen from the platform end | 10 s |
| `rail.door.chime`, `rail.door.open`, `rail.door.close` | The door-closing chime and the doors, from inside the car | 8 s |
| `rail.announce` | The platform announcement jingle (the tune only, not the voice) | 5 s |
| `crossing.bell`, `crossing.boom` | A manned level crossing: the gate bell ringing, the boom coming down and up | 15 s |
| `engine.auto.*` | An auto-rickshaw: idle 15 s, held light revs 10 s, held high revs 10 s, start, stop (four loops at rising steady revs, standing still) | 1 min |
| the share auto, `engine.goods.*` | Same for a share auto and a small goods carrier (Tata Ace or similar), plus its horn | 1 min each |
| `engine.bike.*`, `engine.thumper.*` | A 150 cc commuter motorbike and a Royal Enfield 350: idle, then held revs at four steady points, start, stop | 1 min each |
| `engine.bus.*`, `horn.bus`, `bus.airbrake` | A city bus (MTC) idling at a stop and revving, the air horn, the air-brake hiss and the door | 1 min |
| `horn.goods` | A truck's air horn | 3 s |
| `bed.market` | A busy market lane (T. Nagar, Koyambedu) walking slowly, 30 s with no one speaking into the phone | 30 s |
| `bed.tea` | Standing at a tea stall: boiler hiss, glasses, pouring | 30 s |
| `bell.temple` | A temple bell struck once from 100 m | 10 s |

Hold the phone still, away from wind (a hand or cloth over the mic is not a windscreen: record in a
sheltered spot) and stand where the real player would hear it.
