# Tamil review table

Every Tamil string in the game, with its English, for a **native Tamil speaker** to read (decision
G-443). The Tamil was written by Claude, not by a person: **machine Tamil is never shipped
unreviewed**. Until a string is reviewed its status is `needs native review`.

How to review: fix the Tamil of a row in `assets/i18n/ta.csv` (column `text`), set its `status`
to `reviewed`, then run `python3 tools/i18n/review_table.py` to refresh this table. Placeholders
(`{0}`, `{1}`, `{name}`) must stay in the text. Look especially at: station and street names (OSM
and transliterations), the jokes in the cinema and gym texts, words for game things (பொத்தான்
for button, நற்பெயர் for reputation) and politeness: the game speaks to the player as "you"
(நீங்கள்).

A release build can leave the unreviewed rows out (the export feature tag `tamil_reviewed_only`,
or the project setting `chennai/i18n/hide_unreviewed`): the game then shows those texts in
English only.

**805 Tamil strings, 805 still need native review, 0 reviewed.**

| key | English | Tamil | status |
|---|---|---|---|
| `about.fonts` | Fonts: Barlow Condensed and Noto Sans Tamil, SIL Open Font Licence 1.1. | எழுத்துருக்கள்: Barlow Condensed, Noto Sans Tamil (SIL Open Font Licence 1.1). | needs native review |
| `about.intro` | An original game set in real Chennai. | உண்மையான சென்னையில் நடக்கும் ஒரு புத்தம் புதிய ஆட்டம். | needs native review |
| `about.map` | Map: {0}{1}, ODbL 1.0. Building heights, colours and road widths are estimated where OpenStreetMap has none. | வரைபடம்: {0}{1}, ODbL 1.0. OpenStreetMap-இல் இல்லாத இடங்களில் கட்டடங்களின் உயரம், நிறம், சாலையின் அகலம் ஆகியவை மதிப்பீடுதான். | needs native review |
| `about.map_date` | (map data {0}) | (வரைபடத் தரவு {0}) | needs native review |
| `about.tamil_review` | The Tamil text in this game is still being checked by Tamil speakers, so some lines may read oddly. | இந்த ஆட்டத்தில் உள்ள தமிழ் எழுத்துக்களைத் தமிழ் தெரிந்தவர்கள் இன்னும் சரிபார்த்துக் கொண்டிருக்கிறார்கள்; சில வரிகள் இயல்பாக இல்லாமல் இருக்கலாம். | needs native review |
| `act.board_train` | BOARD THE TRAIN | ரயிலில் ஏறு | needs native review |
| `act.get_in` | GET IN | ஏறு | needs native review |
| `act.take_over` | TAKE OVER | வண்டியைப் பிடி | needs native review |
| `cab.doors_green` | Doors closed. Signal green. Proceed. | கதவுகள் மூடின. சிக்னல் பச்சை. செல்லலாம். | needs native review |
| `cab.doors_wait` | Doors closed. Wait for the signal. | கதவுகள் மூடின. சிக்னலுக்குக் காத்திருங்கள். | needs native review |
| `cab.end_map` | End of the line on the map. Score {0}. | வரைபடத்தில் பாதை முடிந்தது. மதிப்பெண் {0}. | needs native review |
| `cab.far` | Stopped far from the mark | குறியிலிருந்து தொலைவில் நின்றீர்கள் | needs native review |
| `cab.good` | Good stop | நல்ல நிறுத்தம் | needs native review |
| `cab.missed` | Missed the stop at {0} | {0} நிறுத்தத்தைத் தவறவிட்டீர்கள் | needs native review |
| `cab.moved_open` | Moved with doors open | கதவு திறந்திருக்கும்போது ரயிலை நகர்த்திவிட்டீர்கள் | needs native review |
| `cab.overran` | Overran the platform | நடைமேடையைத் தாண்டிவிட்டீர்கள் | needs native review |
| `cab.overspeed` | Over the speed limit | வேக வரம்பை மீறினீர்கள் | needs native review |
| `cab.perfect` | Perfect stop | சரியான நிறுத்தம் | needs native review |
| `cab.short` | Stopped short of the mark | குறிக்கு முன்பே நின்றுவிட்டீர்கள் | needs native review |
| `cab.spad` | Signal passed at danger | சிவப்பு சிக்னலைத் தாண்டிவிட்டீர்கள் | needs native review |
| `cab.state.braking` | Braking {0} | பிரேக் {0} | needs native review |
| `cab.state.coasting` | Coasting | தானாக ஓடுகிறது | needs native review |
| `cab.state.done` | End of the line. Score {0} | பாதை முடிந்தது. மதிப்பெண் {0} | needs native review |
| `cab.state.doors` | Doors open. Passengers getting on and off. | கதவுகள் திறந்துள்ளன. பயணிகள் ஏறி இறங்குகிறார்கள். | needs native review |
| `cab.state.power` | Power {0} | இயக்கம் {0} | needs native review |
| `cab.state.standing` | Standing. Raise the lever to move off. | நிற்கிறது. நகர லீவரை உயர்த்துங்கள். | needs native review |
| `cab.stop_error` | {0} ({1}{2} m) | {0} ({1}{2} மீ) | needs native review |
| `ctl.action` | ACTION | செயல் | needs native review |
| `ctl.brake` | BRAKE | பிரேக் | needs native review |
| `ctl.exit` | EXIT | இறங்கு | needs native review |
| `ctl.exit_tip` | Exit | இறங்கு | needs native review |
| `ctl.gas` | GAS | வேகம் | needs native review |
| `ctl.hold_reverse` | hold to reverse | பின்னால் செல்ல பிடியுங்கள் | needs native review |
| `ctl.horn` | HORN | ஹாரன் | needs native review |
| `ctl.jump` | JUMP | குதி | needs native review |
| `ctl.reverse` | REVERSE | பின்னால் | needs native review |
| `ctl.run` | RUN | ஓடு | needs native review |
| `ctl.siren` | SIREN | சைரன் | needs native review |
| `dlg.choice_wait` | Nothing happens until you decide. | நீங்கள் முடிவு செய்யும் வரை எதுவும் நடக்காது. | needs native review |
| `dlg.choose` | CHOOSE | தேர்ந்தெடு | needs native review |
| `dlg.close` | CLOSE | மூடு | needs native review |
| `dlg.continue` | CONTINUE | தொடர் | needs native review |
| `dlg.from_checkpoint` | from the checkpoint | சேமிப்புப் புள்ளியிலிருந்து | needs native review |
| `dlg.from_start` | from the start | தொடக்கத்திலிருந்து | needs native review |
| `dlg.go` | GO | செல் | needs native review |
| `dlg.health_line` | health {0} | உடல்நலம் {0} | needs native review |
| `dlg.heat` | police heat | போலீஸ் தேடல் | needs native review |
| `dlg.job_board` | Job board | வேலைப் பலகை | needs native review |
| `dlg.job_board_btn` | JOB BOARD | வேலைப் பலகை | needs native review |
| `dlg.jobs` | JOBS | வேலைகள் | needs native review |
| `dlg.leave` | LEAVE | வெளியேறு | needs native review |
| `dlg.play` | PLAY | விளையாடு | needs native review |
| `dlg.quit_job` | QUIT JOB | வேலையை விடு | needs native review |
| `dlg.retry` | RETRY | மீண்டும் முயல் | needs native review |
| `dlg.stages` | STAGES | நிலைகள் | needs native review |
| `dlg.stages_message` | Missions and finished stages, for the medal. A replay pays a quarter. | பதக்கத்துக்காகப் பணிகளும் முடித்த நிலைகளும். மீண்டும் விளையாடினால் கால் பங்கு சம்பளம். | needs native review |
| `dlg.stages_title` | Stages | நிலைகள் | needs native review |
| `dlg.start_over` | START OVER | முதலிலிருந்து தொடங்கு | needs native review |
| `dlg.stop` | STOP | நிறுத்து | needs native review |
| `dlg.take_job` | TAKE JOB | வேலையை எடு | needs native review |
| `dlg.the_stage` | The stage | இந்த நிலை | needs native review |
| `dlg.try_again` | {0}: try again {1}. | {0}: {1} மீண்டும் முயலுங்கள். | needs native review |
| `dlg.workout` | Workout | உடற்பயிற்சி | needs native review |
| `dlg.workout_message` | Tap LIFT while the needle is in the green: {0} reps. | முள் பச்சைப் பகுதியில் இருக்கும்போது 'தூக்கு' என்பதைத் தட்டுங்கள்: {0} முறை. | needs native review |
| `err.ground` | The ground's collider did not appear in {0} physics frames. | {0} இயற்பியல் சட்டங்களுக்குள் தரையின் மோதல் வடிவம் தோன்றவில்லை. | needs native review |
| `err.load` | Could not load {0}. | {0}-ஐ ஏற்ற முடியவில்லை. | needs native review |
| `err.start_loading` | Could not start loading {0}. | {0}-ஐ ஏற்றத் தொடங்க முடியவில்லை. | needs native review |
| `err.step_stopped` | Step {0} stopped with an error (see the log). | படி {0} பிழையுடன் நின்றுவிட்டது (பதிவைப் பாருங்கள்). | needs native review |
| `err.streets_start` | The streets round the start did not load. | தொடக்கத்தைச் சுற்றியுள்ள தெருக்கள் ஏற்றப்படவில்லை. | needs native review |
| `err.traffic` | The streets' traffic could not be worked out. | தெருக்களின் போக்குவரத்தைக் கணக்கிட முடியவில்லை. | needs native review |
| `err.unknown_step` | Unknown step {0}. | தெரியாத படி {0}. | needs native review |
| `err.vehicles_park` | The vehicles round the start did not park. | தொடக்கத்தைச் சுற்றியுள்ள வாகனங்கள் நிறுத்தப்படவில்லை. | needs native review |
| `event.bandh` | A bandh: shops are shutting and the main road is closed. | பந்த்: கடைகள் மூடப்படுகின்றன, பிரதான சாலை அடைக்கப்பட்டுள்ளது. | needs native review |
| `event.detour` | Road ahead blocked by a water-main repair. Find another way. | தண்ணீர்க் குழாய் பழுதுபார்ப்பால் முன்னால் சாலை அடைபட்டுள்ளது. வேறு வழியைப் பாருங்கள். | needs native review |
| `event.passenger_change` | The passenger changes their mind: somewhere nearer, please. | பயணி மனதை மாற்றிக்கொண்டார்: "கொஞ்சம் பக்கத்துலயே இறக்கிவிடுங்க." | needs native review |
| `event.procession` | A temple procession fills the road ahead. Slow down or go round. | கோயில் ஊர்வலம் முன்னால் சாலை முழுவதும் நிறைந்துள்ளது. மெதுவாகச் செல்லுங்கள் அல்லது சுற்றிப் போங்கள். | needs native review |
| `event.rain` | Rain starts. The road will be slick. | மழை தொடங்கிவிட்டது. சாலை வழுக்கும். | needs native review |
| `event.title.bandh` | Bandh | பந்த் | needs native review |
| `event.title.detour` | Detour | மாற்றுப்பாதை | needs native review |
| `event.title.other` | Event | நிகழ்வு | needs native review |
| `event.title.passenger_change` | Change of plan | திட்ட மாற்றம் | needs native review |
| `event.title.procession` | Procession | ஊர்வலம் | needs native review |
| `event.title.rain` | Rain | மழை | needs native review |
| `event.zone.bandh` | Bandh | பந்த் | needs native review |
| `event.zone.detour` | Road blocked | சாலை அடைப்பு | needs native review |
| `event.zone.procession` | Procession | ஊர்வலம் | needs native review |
| `fail.cargo_ruined` | The cargo is ruined | சரக்கு சேதமாகிவிட்டது | needs native review |
| `fail.job_abandoned` | Job abandoned | வேலையை விட்டுவிட்டீர்கள் | needs native review |
| `fail.out_of_time` | Out of time | நேரம் முடிந்துவிட்டது | needs native review |
| `fail.patient_lost` | The patient is lost | நோயாளியைக் காப்பாற்ற முடியவில்லை | needs native review |
| `fail.player_down` | You are down | நீங்கள் விழுந்துவிட்டீர்கள் | needs native review |
| `fail.spotted` | You were spotted | உங்களைப் பார்த்துவிட்டார்கள் | needs native review |
| `fail.story_abandoned` | Story abandoned | கதையை விட்டுவிட்டீர்கள் | needs native review |
| `fail.target_escaped` | They got away | அவர்கள் தப்பிவிட்டார்கள் | needs native review |
| `fail.too_many_crashes` | Too many crashes | மோதல்கள் மிக அதிகம் | needs native review |
| `fail.vehicle_destroyed` | The vehicle is wrecked | வண்டி நொறுங்கிவிட்டது | needs native review |
| `fare.both` | People getting off and on | மக்கள் இறங்கி ஏறுகிறார்கள் | needs native review |
| `fare.in.one` | Passenger getting in | பயணி ஏறுகிறார் | needs native review |
| `fare.in.other` | Passengers getting in | பயணிகள் ஏறுகிறார்கள் | needs native review |
| `fare.out.one` | Passenger getting out | பயணி இறங்குகிறார் | needs native review |
| `fare.out.other` | Passengers getting out | பயணிகள் இறங்குகிறார்கள் | needs native review |
| `fare.patient_in` | The patient is being loaded | நோயாளியை ஏற்றுகிறார்கள் | needs native review |
| `fare.patient_out` | The patient is being taken in | நோயாளியை உள்ளே அழைத்துச் செல்கிறார்கள் | needs native review |
| `gear.in_p` | In P: select D to drive or R to reverse | P-இல் உள்ளது: ஓட்ட D, பின்னால் செல்ல R தேர்ந்தெடுங்கள் | needs native review |
| `gear.stopping` | Stopping to shift to {0} | {0}-க்கு மாற நிற்கிறது | needs native review |
| `goods.cap.cash-bag.one` | The money | பணம் | needs native review |
| `goods.cap.cash-bag.other` | The money | பணம் | needs native review |
| `goods.cap.food-bag.one` | The order | ஆர்டர் | needs native review |
| `goods.cap.food-bag.other` | The orders | ஆர்டர்கள் | needs native review |
| `goods.cap.harmonium.one` | The harmonium | ஹார்மோனியம் | needs native review |
| `goods.cap.harmonium.other` | The harmoniums | ஹார்மோனியங்கள் | needs native review |
| `goods.cap.medicine.one` | The medicine | மருந்து | needs native review |
| `goods.cap.medicine.other` | The medicine | மருந்துகள் | needs native review |
| `goods.cap.parcel.one` | The parcel | பார்சல் | needs native review |
| `goods.cap.parcel.other` | The parcels | பார்சல்கள் | needs native review |
| `goods.cap.the_goods` | The goods | சரக்கு | needs native review |
| `goods.cap.tiffin.one` | The lunch box | மதிய உணவுப் பெட்டி | needs native review |
| `goods.cap.tiffin.other` | The lunch boxes | மதிய உணவுப் பெட்டிகள் | needs native review |
| `goods.cap.vessel.one` | The sambar vessel | சாம்பார் பாத்திரம் | needs native review |
| `goods.cap.vessel.other` | The sambar vessels | சாம்பார் பாத்திரங்கள் | needs native review |
| `goods.cash-bag.one` | the money | பணம் | needs native review |
| `goods.cash-bag.other` | the money | பணம் | needs native review |
| `goods.collecting` | {0} being collected | {0} பெறப்படுகிறது | needs native review |
| `goods.food-bag.one` | the order | ஆர்டர் | needs native review |
| `goods.food-bag.other` | the orders | ஆர்டர்கள் | needs native review |
| `goods.harmonium.one` | the harmonium | ஹார்மோனியம் | needs native review |
| `goods.harmonium.other` | the harmoniums | ஹார்மோனியங்கள் | needs native review |
| `goods.loading` | {0} being loaded | {0} ஏற்றப்படுகிறது | needs native review |
| `goods.medicine.one` | the medicine | மருந்து | needs native review |
| `goods.medicine.other` | the medicine | மருந்துகள் | needs native review |
| `goods.parcel.one` | the parcel | பார்சல் | needs native review |
| `goods.parcel.other` | the parcels | பார்சல்கள் | needs native review |
| `goods.the_goods` | the goods | சரக்கு | needs native review |
| `goods.tiffin.one` | the lunch box | மதிய உணவுப் பெட்டி | needs native review |
| `goods.tiffin.other` | the lunch boxes | மதிய உணவுப் பெட்டிகள் | needs native review |
| `goods.vessel.one` | the sambar vessel | சாம்பார் பாத்திரம் | needs native review |
| `goods.vessel.other` | the sambar vessels | சாம்பார் பாத்திரங்கள் | needs native review |
| `guide.accelerate` | Accelerate | வேகம் கூட்டுங்கள் | needs native review |
| `guide.action_pad` | Action: get in, talk, pick up, hand over | செயல்: ஏறுங்கள், பேசுங்கள், எடுங்கள், கொடுங்கள் | needs native review |
| `guide.action_touch` | Action: GET IN, TALK, PICK UP, HAND OVER, ENTER | செயல்: ஏறு, பேசு, எடு, கொடு, உள்ளே செல் | needs native review |
| `guide.big_button` | Big round button | பெரிய வட்டப் பொத்தான் | needs native review |
| `guide.brake_or_space` | S or Space | S அல்லது Space | needs native review |
| `guide.brake_reverse` | Brake; hold when stopped to reverse | பிரேக்; நின்றபின் அழுத்திப் பிடித்தால் பின்னால் செல்லும் | needs native review |
| `guide.drag_side` | Drag the {0} side | {0} பக்கத்தை இழுங்கள் | needs native review |
| `guide.exit_stopped` | Get out when stopped | வண்டி நின்றதும் இறங்குங்கள் | needs native review |
| `guide.foot.walk_run` | Walk; push to the edge to run | நடக்கலாம்; ஓட ஸ்டிக்கை ஓரம் வரை தள்ளுங்கள் | needs native review |
| `guide.gas` | Gas | வேகம் கூட்டுங்கள் | needs native review |
| `guide.get_out` | Get out | இறங்குங்கள் | needs native review |
| `guide.group.anywhere` | ANYWHERE | எப்போதும் | needs native review |
| `guide.group.driving` | DRIVING | ஓட்டும்போது | needs native review |
| `guide.group.foot` | ON FOOT | நடக்கும்போது | needs native review |
| `guide.horn` | Horn | ஹாரன் | needs native review |
| `guide.horn_pad` | Horn (siren on an ambulance or police car) | ஹாரன் (ஆம்புலன்ஸ் அல்லது போலீஸ் காரில் சைரன்) | needs native review |
| `guide.horn_touch` | Horn (SIREN on an ambulance or police car) | ஹாரன் (ஆம்புலன்ஸ் அல்லது போலீஸ் காரில் சைரன்) | needs native review |
| `guide.jobs` | The job board and your stages | வேலைப் பலகையும் உங்கள் நிலைகளும் | needs native review |
| `guide.jump` | Jump | குதியுங்கள் | needs native review |
| `guide.look` | Look round | சுற்றிப் பாருங்கள் | needs native review |
| `guide.mouse_drag` | Mouse drag | மவுஸை இழுக்கவும் | needs native review |
| `guide.pause` | Pause | இடைநிறுத்தம் | needs native review |
| `guide.pause_menu` | Pause: resume, change the time, weather, sound or the controls, or go to the title | இடைநிறுத்தம்: தொடரலாம்; நேரம், வானிலை, ஒலி, கட்டுப்பாடுகளை மாற்றலாம்; அல்லது தலைப்புத் திரைக்குச் செல்லலாம் | needs native review |
| `guide.run` | Run | ஓட | needs native review |
| `guide.side.left` | left | இடது | needs native review |
| `guide.side.right` | right | வலது | needs native review |
| `guide.slide_side` | Slide the {0} side | {0} பக்கத்தில் நகர்த்துங்கள் | needs native review |
| `guide.small_button` | Small button above it | அதற்கு மேலே உள்ள சிறிய பொத்தான் | needs native review |
| `guide.steer` | Steer | திருப்புங்கள் | needs native review |
| `guide.steer_touch` | Steer: touch anywhere, slide sideways; it centres itself | திருப்ப: எங்கு வேண்டுமானாலும் தொட்டுப் பக்கவாட்டில் நகர்த்துங்கள்; தானாக நடுவுக்கு வந்துவிடும் | needs native review |
| `guide.stick.left` | Left stick | இடது ஸ்டிக் | needs native review |
| `guide.stick.right` | Right stick | வலது ஸ்டிக் | needs native review |
| `guide.stick_appears` | A stick appears: walk; push to the edge to run | ஒரு ஸ்டிக் தோன்றும்: நடக்கலாம்; ஓட ஓரம் வரை தள்ளுங்கள் | needs native review |
| `guide.stick_appears_toggle` | A stick appears: walk; tap RUN to run | ஒரு ஸ்டிக் தோன்றும்: நடக்கலாம்; ஓட 'ஓடு' பொத்தானைத் தட்டுங்கள் | needs native review |
| `guide.touch_side` | Touch the {0} side | {0} பக்கத்தைத் தொடுங்கள் | needs native review |
| `guide.walk` | Walk | நடக்க | needs native review |
| `hud.cargo` | Cargo | சரக்கு | needs native review |
| `hud.go_inside` | GO INSIDE | உள்ளே செல் | needs native review |
| `hud.goals_met` | {0} of {1} goals | {1} இலக்குகளில் {0} | needs native review |
| `hud.jobs` | JOBS | வேலைகள் | needs native review |
| `hud.km` | {0} km | {0} கி.மீ | needs native review |
| `hud.lift` | LIFT | தூக்கு | needs native review |
| `hud.m` | {0} m | {0} மீ | needs native review |
| `hud.medal.bronze` | Bronze | வெண்கலம் | needs native review |
| `hud.medal.gold` | Gold | தங்கம் | needs native review |
| `hud.medal.silver` | Silver | வெள்ளி | needs native review |
| `hud.medal_line` | {0} medal | {0} பதக்கம் | needs native review |
| `hud.noticed` | Noticed | கவனிக்கப்பட்டது | needs native review |
| `hud.patient` | Patient | நோயாளி | needs native review |
| `hud.pause` | PAUSE | இடைநிறுத்து | needs native review |
| `hud.replay` | (replay) | (மீண்டும் விளையாடியது) | needs native review |
| `hud.stages` | Stages {0}/{1} | நிலைகள் {0}/{1} | needs native review |
| `hud.take` | TAKE | ஏற்றுக்கொள் | needs native review |
| `hud.world_text` | {0} roads · {1} chunks | {0} சாலைகள் · {1} பகுதிகள் | needs native review |
| `job.avoid_kept` | Kept off {0}: +{1}% | {0}-ஐத் தவிர்த்தீர்கள்: +{1}% | needs native review |
| `job.avoid_stuck` | Stuck on {0} for {1} s: -{2}% | {0}-இல் {1} வினாடி சிக்கினீர்கள்: -{2}% | needs native review |
| `job.needs_rep` | Needs reputation {0} | நற்பெயர் {0} தேவை | needs native review |
| `job.note.bumps.one` | {n} bump: -{pct}% | {n} மோதல்: -{pct}% | needs native review |
| `job.note.bumps.other` | {n} bumps: -{pct}% | {n} மோதல்கள்: -{pct}% | needs native review |
| `job.note.bumps_only.one` | {n} bump | {n} மோதல் | needs native review |
| `job.note.bumps_only.other` | {n} bumps | {n} மோதல்கள் | needs native review |
| `job.note.carried.one` | {n} passenger carried, ₹{fares} in fares | {n} பயணி ஏற்றப்பட்டார், கட்டணம் ₹{fares} | needs native review |
| `job.note.carried.other` | {n} passengers carried, ₹{fares} in fares | {n} பயணிகள் ஏற்றப்பட்டனர், கட்டணம் ₹{fares} | needs native review |
| `job.note.late.one` | {n} stop late: -{pct}% | {n} நிறுத்தம் தாமதம்: -{pct}% | needs native review |
| `job.note.late.other` | {n} stops late: -{pct}% | {n} நிறுத்தங்கள் தாமதம்: -{pct}% | needs native review |
| `job.note.left` | {0} left waiting with a seat free | இடம் இருந்தும் {0} பேர் காத்திருக்க விடப்பட்டனர் | needs native review |
| `job.note.missed` | {0} carried past their stop | {0} பேரை அவர்கள் இறங்க வேண்டிய இடத்தைத் தாண்டிக் கொண்டுசென்றீர்கள் | needs native review |
| `job.note.parcel` | Parcel undamaged: +25% | பார்சல் சேதமில்லை: +25% | needs native review |
| `job.note.rating` | {0}★ rating: {1}₹{2} tip | {0}★ மதிப்பீடு: {1}₹{2} டிப்ஸ் | needs native review |
| `job.note.reached` | Reached {0} | {0} சென்றடைந்தீர்கள் | needs native review |
| `job.note.shift_up` | Shift time up | ஷிஃப்ட் நேரம் முடிந்தது | needs native review |
| `job.note.smooth` | Smooth ride: +20% | சுமுகமான பயணம்: +20% | needs native review |
| `job.note.time_left` | {0}% of the time left | {0}% நேரம் மீதம் | needs native review |
| `job.offered_only` | Offered {0} only | {0} மட்டும் கிடைக்கும் | needs native review |
| `life.change_clothes` | You change into the {0}. Your mother says it needs ironing. | நீங்கள் {0} அணிகிறீர்கள். அம்மா, "அயன் பண்ணனும்" என்கிறார். | needs native review |
| `life.escalator` | The escalator is jammed with families taking a group photo on every step. Ten minutes to go up one floor. | நகரும் படிக்கட்டின் ஒவ்வொரு படியிலும் குடும்பங்கள் குரூப் ஃபோட்டோ எடுப்பதால் நெரிசல். ஒரு மாடி ஏறப் பத்து நிமிடம் ஆகிறது. | needs native review |
| `life.film.filter-coffee-kadhal.genre` | Romance | காதல் | needs native review |
| `life.film.filter-coffee-kadhal.plot` | Two rival coffee-stall owners on the same street fall in love during a week of monsoon rain. | ஒரே தெருவில் உள்ள இரண்டு போட்டி காபிக் கடைக்காரர்கள், ஒரு வாரம் பெய்யும் பருவமழையில் காதலில் விழுகிறார்கள். | needs native review |
| `life.film.filter-coffee-kadhal.scene.0` | A song in the rain, under one shared umbrella with a hole in it. | ஓட்டை விழுந்த ஒரே குடையின் கீழ், மழையில் ஒரு பாட்டு. | needs native review |
| `life.film.filter-coffee-kadhal.scene.1` | They argue over chicory for ten full minutes, then hold hands. | சிக்கரியைப் பற்றிப் பத்து நிமிடம் முழுக்கச் சண்டை போட்டுவிட்டு, பிறகு கைகோர்க்கிறார்கள். | needs native review |
| `life.film.filter-coffee-kadhal.title` | Filter Coffee Kadhal | ஃபில்டர் காபி காதல் | needs native review |
| `life.film.roundtana-thunder.genre` | Action drama | ஆக்ஷன் நாடகம் | needs native review |
| `life.film.roundtana-thunder.plot` | A soft-spoken bus conductor stands up to the gang that hoards the neighbourhood's water tankers. | மென்மையாகப் பேசும் ஒரு பேருந்து நடத்துநர், ஊரின் தண்ணீர் லாரிகளைப் பதுக்கும் கும்பலை எதிர்த்து நிற்கிறார். | needs native review |
| `life.film.roundtana-thunder.scene.0` | The conductor stops a runaway tanker with one punch-ticket. | ஓடிப்போன தண்ணீர் லாரியை நடத்துநர் ஒரே டிக்கெட் பஞ்சில் நிறுத்துகிறார். | needs native review |
| `life.film.roundtana-thunder.scene.1` | Slow-motion walk through a water-pipe shower, three times. | தண்ணீர்க் குழாய் மழையில் ஸ்லோ மோஷன் நடை, மூன்று முறை. | needs native review |
| `life.film.roundtana-thunder.title` | Roundtana Thunder | ரவுண்டானா தண்டர் | needs native review |
| `life.film.sambar-sunday.genre` | Family comedy | குடும்பக் காமெடி | needs native review |
| `life.film.sambar-sunday.plot` | Three generations of one family fight over the last vada at a cousin's wedding lunch. | ஒரு குடும்பத்தின் மூன்று தலைமுறையினர், ஒரு உறவினர் கல்யாண விருந்தில் கடைசி வடைக்காகச் சண்டை போடுகிறார்கள். | needs native review |
| `life.film.sambar-sunday.scene.0` | Grandfather hides the vada inside his turban. | தாத்தா வடையைத் தன் தலைப்பாகைக்குள் ஒளித்து வைக்கிறார். | needs native review |
| `life.film.sambar-sunday.scene.1` | The bride's uncle starts a sambar-tasting contest that nobody asked for. | மணப்பெண்ணின் மாமா யாருமே கேட்காத சாம்பார் ருசிப் போட்டியைத் தொடங்குகிறார். | needs native review |
| `life.film.sambar-sunday.title` | Sambar Sunday | சாம்பார் சண்டே | needs native review |
| `life.film_line` | {0} ({1}). {2} | {0} ({1}). {2} | needs native review |
| `life.film_over` | {0} is over at {1}. | {0} படம் {1}-க்கு முடிகிறது. | needs native review |
| `life.free_socks` | BUY 1 GET 1*: your free item is a pair of socks (*see small print). | ஒன்று வாங்கினால் ஒன்று இலவசம்*: உங்கள் இலவசப் பொருள் ஒரு ஜோடி சாக்ஸ் (*விதிமுறைகளைப் பாருங்கள்). | needs native review |
| `life.free_socks_again` | The free item is socks again; you already have socks. | இலவசப் பொருள் மறுபடியும் சாக்ஸ்தான்; உங்களிடம் ஏற்கெனவே சாக்ஸ் இருக்கிறது. | needs native review |
| `life.gym_pass` | A day pass is ₹{0}. The trainer suggests push-ups at home. | ஒரு நாள் அனுமதி ₹{0}. பயிற்சியாளர் வீட்டிலேயே புஷ்-அப் செய்யச் சொல்கிறார். | needs native review |
| `life.healthy` | The doctor checks you over: perfectly healthy. The nurse gives you a lollipop anyway. | மருத்துவர் பரிசோதிக்கிறார்: முழு ஆரோக்கியம். இருந்தாலும் செவிலியர் உங்களுக்கு ஒரு லாலிபாப் கொடுக்கிறார். | needs native review |
| `life.moment.end` | The credits roll and half the hall is already outside, discussing the climax. | டைட்டில் கார்டு ஓடுகிறது; பாதி அரங்கம் ஏற்கெனவே வெளியே நின்று க்ளைமாக்ஸைப் பற்றிப் பேசிக்கொண்டிருக்கிறது. | needs native review |
| `life.moment.entry` | The hero's entry: the whole hall whistles, and paper confetti rains from the back rows. | ஹீரோ என்ட்ரி: அரங்கமே விசில் அடிக்கிறது, பின் வரிசைகளிலிருந்து காகிதத் துண்டுகள் மழையாகப் பொழிகின்றன. | needs native review |
| `life.moment.interval` | INTERVAL. Everyone rushes the snack counter at once, as if the popcorn might run out. | இன்டர்வெல். பாப்கார்ன் தீர்ந்துவிடுமோ என்பது போல எல்லோரும் ஒரே நேரத்தில் தின்பண்டக் கவுண்ட்டருக்கு ஓடுகிறார்கள். | needs native review |
| `life.moment.phone` | Someone's phone rings, loudly. He answers: "I'm in the theatre, the hero just came. Call me at the interval." | யாரோ ஒருவரின் போன் உரக்க அடிக்கிறது. அவர் எடுத்துச் சொல்கிறார்: "தியேட்டர்ல இருக்கேன், ஹீரோ இப்பதான் வந்தாரு. இன்டர்வெல்ல கூப்பிடு." | needs native review |
| `life.no_film` | No such film. | அப்படி ஒரு படம் இல்லை. | needs native review |
| `life.no_popcorn` | No money for popcorn. Your neighbour offers you one piece. | பாப்கார்னுக்குப் பணம் இல்லை. பக்கத்து இருக்கைக்காரர் உங்களுக்கு ஒரே ஒரு துண்டு தருகிறார். | needs native review |
| `life.not_for_sale` | Not for sale. | விற்பனைக்கு இல்லை. | needs native review |
| `life.not_ill` | You are not ill. The man behind you in the queue asks if you will give him your token. | உங்களுக்கு உடம்பு சரியில்லை என்று ஒன்றுமில்லை. வரிசையில் பின்னால் நிற்பவர், "உங்க டோக்கனை எனக்குத் தருவீங்களா?" என்று கேட்கிறார். | needs native review |
| `life.outfit.everyday` | Everyday shirt and trousers | தினசரி சட்டை, பேண்ட் | needs native review |
| `life.outfit.festival` | Green festival shirt | பச்சைப் பண்டிகைச் சட்டை | needs native review |
| `life.outfit.lower.everyday` | everyday shirt and trousers | தினசரி சட்டை, பேண்ட் | needs native review |
| `life.outfit.lower.festival` | green festival shirt | பச்சைப் பண்டிகைச் சட்டை | needs native review |
| `life.outfit.lower.maroon-shirt` | maroon silk-cotton shirt | மரூன் நிற பட்டுப்பருத்திச் சட்டை | needs native review |
| `life.outfit.lower.mustard-kurta` | mustard kurta | கடுகு நிறக் குர்தா | needs native review |
| `life.outfit.lower.track-suit` | blue track suit | நீல நிற டிராக் சூட் | needs native review |
| `life.outfit.maroon-shirt` | Maroon silk-cotton shirt | மரூன் நிற பட்டுப்பருத்திச் சட்டை | needs native review |
| `life.outfit.mustard-kurta` | Mustard kurta | கடுகு நிறக் குர்தா | needs native review |
| `life.outfit.track-suit` | Blue track suit | நீல நிற டிராக் சூட் | needs native review |
| `life.outfit_bought` | You buy the {0} and wear it out of the shop. {1} | நீங்கள் {0} வாங்கி, கடையிலிருந்து அதை அணிந்தபடியே வெளியே வருகிறீர்கள். {1} | needs native review |
| `life.outfit_costs` | The {0} is ₹{1}. You have ₹{2}. | {0} விலை ₹{1}. உங்களிடம் ₹{2} இருக்கிறது. | needs native review |
| `life.own` | You already own the {0}. | {0} ஏற்கெனவே உங்களிடம் இருக்கிறது. | needs native review |
| `life.popcorn` | Popcorn, ₹{0}. By the time you are back, your neighbour has eaten a third of it. | பாப்கார்ன், ₹{0}. நீங்கள் திரும்பி வருவதற்குள் பக்கத்து இருக்கைக்காரர் மூன்றில் ஒரு பங்கைச் சாப்பிட்டுவிட்டார். | needs native review |
| `life.queue_done` | Three hours, one token number and four new friends in the queue later, you are treated for free. | மூன்று மணி நேரம், ஒரு டோக்கன் எண், வரிசையில் நான்கு புது நண்பர்கள் - அதன் பிறகு இலவசமாகச் சிகிச்சை கிடைக்கிறது. | needs native review |
| `life.reps.low` | {0} of {1} good reps. The trainer says you lifted more selfies than weights. Not counted. | {1}-இல் {0} சரியான முறை. பயிற்சியாளர், "நீங்க எடையை விட செல்ஃபியைத்தான் அதிகம் தூக்கினீங்க" என்கிறார். கணக்கில் சேராது. | needs native review |
| `life.reps.rest` | {0} of {1} good reps. You already trained today: rest days build muscle too. Come back tomorrow. | {1}-இல் {0} சரியான முறை. இன்று ஏற்கெனவே பயிற்சி செய்துவிட்டீர்கள்; ஓய்வு நாட்களும் தசையை வளர்க்கும். நாளை வாருங்கள். | needs native review |
| `life.reps.top` | {0} of {1} good reps. Already at top fitness: the trainer asks you to demonstrate for the new joiners. | {1}-இல் {0} சரியான முறை. ஏற்கெனவே உச்ச உடல் தகுதியில் இருக்கிறீர்கள்; புதிதாகச் சேர்ந்தவர்களுக்குச் செய்து காட்டச் சொல்கிறார் பயிற்சியாளர். | needs native review |
| `life.reps.up` | {0} of {1} good reps. Fitness {2}/{3}: sprinting is {4}% faster. | {1}-இல் {0} சரியான முறை. உடல் தகுதி {2}/{3}: ஓட்டம் {4}% வேகமாகிறது. | needs native review |
| `life.sleep` | You sleep until {0}. The neighbour's pressure cooker whistles you awake, fully rested. Game saved. | நீங்கள் {0} வரை தூங்குகிறீர்கள். பக்கத்து வீட்டு குக்கர் விசில் உங்களை எழுப்புகிறது; நன்றாக ஓய்வெடுத்துவிட்டீர்கள். ஆட்டம் சேமிக்கப்பட்டது. | needs native review |
| `life.snack.bajji-plate` | Bajji plate | பஜ்ஜி தட்டு | needs native review |
| `life.snack.corn-cup` | Masala corn cup | மசாலா கார்ன் கப் | needs native review |
| `life.snack.filter-coffee` | Filter coffee | ஃபில்டர் காபி | needs native review |
| `life.snack_bought` | {0}: +{1} health. | {0}: +{1} உடல்நலம். | needs native review |
| `life.snack_costs` | {0} is ₹{1}. You have ₹{2}. | {0} விலை ₹{1}. உங்களிடம் ₹{2} இருக்கிறது. | needs native review |
| `life.sold_out` | Sold out. | தீர்ந்துவிட்டது. | needs native review |
| `life.ticket_costs` | A ticket is ₹{0}. You have ₹{1}. | டிக்கெட் ₹{0}. உங்களிடம் ₹{1} இருக்கிறது. | needs native review |
| `life.treat_ambulance` | You came in with the ambulance, so the staff treat you free. A bandage, a tetanus shot and a lecture about helmets. | நீங்கள் ஆம்புலன்ஸில் வந்ததால் இலவசமாகச் சிகிச்சை அளிக்கிறார்கள். ஒரு கட்டு, ஒரு டெட்டனஸ் ஊசி, ஹெல்மெட் பற்றி ஒரு அறிவுரை. | needs native review |
| `life.treat_costs` | Treatment costs ₹{0} and you have ₹{1}. The free counter is always open, if you can wait. | சிகிச்சைக்கு ₹{0} ஆகும்; உங்களிடம் ₹{1} இருக்கிறது. காத்திருக்க முடிந்தால் இலவசக் கவுண்ட்டர் எப்போதும் திறந்திருக்கும். | needs native review |
| `life.treat_paid` | Bandaged and patched up for ₹{0}. The doctor writes "rest" on the prescription in very large letters. | ₹{0}-க்குக் கட்டுப்போட்டுச் சரிசெய்தார்கள். மருத்துவர் மருந்துச் சீட்டில் "ஓய்வு" என்று பெரிய எழுத்தில் எழுதுகிறார். | needs native review |
| `life.wait_lobby` | You wait in the lobby for the {0} show. | {0} காட்சிக்காக லாபியில் காத்திருக்கிறீர்கள். | needs native review |
| `life.walk_in` | You walk in just as the {0} show starts. | {0} காட்சி தொடங்கும் நேரத்திலேயே உள்ளே நுழைகிறீர்கள். | needs native review |
| `loading.brand` | OPEN WORLD | திறந்த உலகம் | needs native review |
| `loading.close` | CLOSE | மூடு | needs native review |
| `loading.dots` | {0}… | {0}… | needs native review |
| `loading.fail` | Could not load | ஏற்ற முடியவில்லை | needs native review |
| `loading.fail_step` | Could not finish: {0} | முடிக்க முடியவில்லை: {0} | needs native review |
| `loading.retry` | TRY AGAIN | மீண்டும் முயற்சி | needs native review |
| `loading.slow` | Still working on: {0} ({1} s). A slow phone can need a minute. | இன்னும் நடந்துகொண்டிருக்கிறது: {0} ({1} வினாடி). மெதுவான போனுக்கு ஒரு நிமிடம் ஆகலாம். | needs native review |
| `loading.slow_default` | loading | ஏற்றுகிறது | needs native review |
| `loading.step.0` | Reading the map of Chennai | சென்னை வரைபடத்தைப் படிக்கிறது | needs native review |
| `loading.step.1` | Reading the streets | தெருக்களைப் படிக்கிறது | needs native review |
| `loading.step.2` | Building the streets around you | உங்களைச் சுற்றியுள்ள தெருக்களை உருவாக்குகிறது | needs native review |
| `loading.step.3` | Parking the vehicles | வாகனங்களை நிறுத்துகிறது | needs native review |
| `loading.step.4` | Running the trains | ரயில்களை ஓடவிடுகிறது | needs native review |
| `loading.tip.0` | Chennai was called Madras until 1996. | 1996 வரை சென்னையை மெட்ராஸ் என்று அழைத்தார்கள். | needs native review |
| `loading.tip.1` | Tap RUN to run; it stops when you let go of the stick. | ஓட 'ஓடு' பொத்தானைத் தட்டுங்கள்; ஸ்டிக்கை விட்டால் நின்றுவிடும். | needs native review |
| `loading.tip.2` | Chennai Central railway station opened in 1873. | சென்னை சென்ட்ரல் ரயில் நிலையம் 1873-இல் திறக்கப்பட்டது. | needs native review |
| `loading.tip.3` | Change the time of day or the weather from PAUSE or SETTINGS. | நேரத்தையும் வானிலையையும் 'இடைநிறுத்து' அல்லது 'அமைப்புகள்' பகுதியில் மாற்றலாம். | needs native review |
| `loading.tip.4` | Marina Beach is one of the longest urban beaches in the world. | உலகின் மிக நீளமான நகரக் கடற்கரைகளில் மெரினாவும் ஒன்று. | needs native review |
| `map.close` | CLOSE | மூடு | needs native review |
| `map.credit_estimated` | {0}, estimated heights and widths | {0}, உயரங்களும் அகலங்களும் மதிப்பீடு | needs native review |
| `map.drawing` | Drawing the map... | வரைபடத்தை வரைகிறது... | needs native review |
| `map.kind.dropoff` | Drop off | இறக்கும் இடம் | needs native review |
| `map.kind.fight` | Fight | சண்டை | needs native review |
| `map.kind.mission` | Mission | பணி | needs native review |
| `map.kind.pickup` | Pick up | ஏற்றும் இடம் | needs native review |
| `map.kind.place` | Place | இடம் | needs native review |
| `map.kind.target` | Target | இலக்கு | needs native review |
| `map.kind.vehicle` | Vehicle | வாகனம் | needs native review |
| `map.me` | ME | நான் | needs native review |
| `map.north` | N | வ | needs native review |
| `map.title` | MAP | வரைபடம் | needs native review |
| `menu.pause.map` | MAP | வரைபடம் | needs native review |
| `menu.pause.quit` | QUIT TO TITLE | தலைப்புத் திரைக்குச் செல் | needs native review |
| `menu.pause.resume` | RESUME | தொடர் | needs native review |
| `menu.pause.tip` | Pause | இடைநிறுத்து | needs native review |
| `menu.pause.title` | PAUSED | இடைநிறுத்தம் | needs native review |
| `msn.aboard` | {0}/{1} aboard | {0}/{1} பேர் உள்ளே | needs native review |
| `msn.all_complete` | All stages complete | எல்லா நிலைகளும் முடிந்தன | needs native review |
| `msn.all_complete_detail` | Free roam: the city is yours. | சுதந்திரமாகச் சுற்றுங்கள்: நகரம் உங்களுடையது. | needs native review |
| `msn.all_done_detail` | Every stage is complete. The city is yours. | எல்லா நிலைகளும் முடிந்தன. நகரம் உங்களுடையது. | needs native review |
| `msn.avoided` | {sp}· {s} s on {name} | {sp}· {name}-இல் {s} வினாடி | needs native review |
| `msn.back_checkpoint` | {0}: back to the checkpoint | {0}: சேமிப்புப் புள்ளிக்குத் திரும்புகிறது | needs native review |
| `msn.best` | best ₹{0} | சிறந்தது ₹{0} | needs native review |
| `msn.board_default` | Everyday work around the city. Failing a job costs a fine and reputation, never the game. Reputation {0}. | நகரைச் சுற்றிய அன்றாட வேலைகள். வேலையில் தோற்றால் அபராதமும் நற்பெயர் இழப்பும் மட்டுமே, ஆட்டம் முடியாது. நற்பெயர் {0}. | needs native review |
| `msn.board_on_job` | On the job: {0}. Quitting costs ₹{1} and reputation. | வேலையில் இருக்கிறீர்கள்: {0}. விட்டுவிட்டால் ₹{1} அபராதமும் நற்பெயர் இழப்பும். | needs native review |
| `msn.bump` | Bump! | மோதல்! | needs native review |
| `msn.bump_cost` | That will cost you | இது உங்களுக்குச் செலவாகும் | needs native review |
| `msn.bump_patient` | Careful with the patient | நோயாளி இருக்கிறார், கவனம் | needs native review |
| `msn.bumps.one` | {sp}· {n} bump | {sp}· {n} மோதல் | needs native review |
| `msn.bumps.other` | {sp}· {n} bumps | {sp}· {n} மோதல்கள் | needs native review |
| `msn.checkpoint` | Checkpoint | சேமிப்புப் புள்ளி | needs native review |
| `msn.checkpoint_detail` | A retry starts here | மீண்டும் முயன்றால் இங்கிருந்து தொடங்கும் | needs native review |
| `msn.clock_detail` | {0} for the whole job | வேலை முழுவதற்கும் {0} | needs native review |
| `msn.clock_running` | The clock is running | நேரம் ஓடிக்கொண்டிருக்கிறது | needs native review |
| `msn.clothes` | Change clothes | உடை மாற்று | needs native review |
| `msn.complete_detail` | {0} · +₹{1}{2}{3} | {0} · +₹{1}{2}{3} | needs native review |
| `msn.drive_to_end` | Drive on to {0}, the end of the route | பாதையின் முடிவான {0} வரை தொடர்ந்து ஓட்டுங்கள் | needs native review |
| `msn.drive_to_start` | Drive to the start; the clock starts there. {0} | தொடக்கத்துக்கு ஓட்டுங்கள்; நேரம் அங்கிருந்து தொடங்கும். {0} | needs native review |
| `msn.drive_to_start_at` | Drive to the start of the route at {0}; the clock starts there | {0} என்ற இடத்தில் உள்ள பாதையின் தொடக்கத்துக்கு ஓட்டுங்கள்; நேரம் அங்கிருந்து தொடங்கும் | needs native review |
| `msn.drop_where` | Drop the passenger where they asked | பயணி கேட்ட இடத்தில் இறக்கிவிடுங்கள் | needs native review |
| `msn.escalator` | Take the escalator up | நகரும் படிக்கட்டில் மேலே செல்லுங்கள் | needs native review |
| `msn.escalator_detail` | Ten minutes, usually | பொதுவாகப் பத்து நிமிடம் | needs native review |
| `msn.fare_plus` | Fare +₹{0} | கட்டணம் +₹{0} | needs native review |
| `msn.film_detail` | ₹{0} · next show {1} | ₹{0} · அடுத்த காட்சி {1} | needs native review |
| `msn.film_label` | {0} ({1}) | {0} ({1}) | needs native review |
| `msn.fine` | Fine ₹{0}. | அபராதம் ₹{0}. | needs native review |
| `msn.finish_job_first` | Finish or quit the current job first | முதலில் இப்போதைய வேலையை முடியுங்கள் அல்லது விடுங்கள் | needs native review |
| `msn.free_counter` | Free counter | இலவசக் கவுண்ட்டர் | needs native review |
| `msn.get_back_in` | Get back in the {0} | மீண்டும் {0}-இல் ஏறுங்கள் | needs native review |
| `msn.get_in` | Get in the {0} | {0}-இல் ஏறுங்கள் | needs native review |
| `msn.half_pay` | {0} · half pay now | {0} · இப்போது பாதிச் சம்பளம் | needs native review |
| `msn.jammed` | {0} is jammed | {0} நெரிசலில் உள்ளது | needs native review |
| `msn.jammed_detail` | Cross it, don't drive along it: time on it cuts the pay | குறுக்கே கடந்து செல்லுங்கள், அதிலேயே ஓட்டாதீர்கள்: அதில் இருக்கும் நேரம் சம்பளத்தைக் குறைக்கும் | needs native review |
| `msn.job_complete` | {0} complete | {0} முடிந்தது | needs native review |
| `msn.job_failed` | Job failed | வேலை தோல்வியடைந்தது | needs native review |
| `msn.job_failed_detail` | {0}. {1}Reputation {2}. The city still needs drivers: try again from the board. | {0}. {1}நற்பெயர் {2}. நகரத்துக்கு இன்னும் ஓட்டுநர்கள் தேவை: பலகையிலிருந்து மீண்டும் முயலுங்கள். | needs native review |
| `msn.job_meta` | {0} · up to ₹{1} · {2} min | {0} · ₹{1} வரை · {2} நிமிடம் | needs native review |
| `msn.job_panel` | Job · {0}{1}{2} | வேலை · {0}{1}{2} | needs native review |
| `msn.job_panel_share` | Job · {0} · {1}/{2} aboard · ₹{3}{4} | வேலை · {0} · {1}/{2} பேர் உள்ளே · ₹{3}{4} | needs native review |
| `msn.job_result` | +₹{0} · {1}{2} · {3} s · reputation {4}{5}. {6}. | +₹{0} · {1}{2} · {3} வினாடி · நற்பெயர் {4}{5}. {6}. | needs native review |
| `msn.label_note` | {0} · {1} | {0} · {1} | needs native review |
| `msn.medal_suffix` | {sp}· {m} medal | {sp}· {m} பதக்கம் | needs native review |
| `msn.missed_detail` | They got off further on and paid nothing | அவர்கள் தள்ளிப்போய் இறங்கினார்கள்; பணம் தரவில்லை | needs native review |
| `msn.missed_stop` | Missed their stop | அவர்கள் இறங்க வேண்டிய இடத்தைத் தவறவிட்டீர்கள் | needs native review |
| `msn.mission` | Mission | பணி | needs native review |
| `msn.mission_complete` | {0} complete | {0} முடிந்தது | needs native review |
| `msn.not_now` | Not now. | இப்போது முடியாது. | needs native review |
| `msn.nothing` | Nothing to do. | செய்ய ஒன்றுமில்லை. | needs native review |
| `msn.on_this_job` | On this job now | இப்போது இந்த வேலையில் இருக்கிறீர்கள் | needs native review |
| `msn.owned` | Owned | வாங்கியது | needs native review |
| `msn.panel_mission` | Mission · {0} | பணி · {0} | needs native review |
| `msn.panel_replay` | Replay · {0} | மீண்டும் · {0} | needs native review |
| `msn.panel_stage` | Stage {0} · {1} | நிலை {0} · {1} | needs native review |
| `msn.passed_detail` | There was a free seat: that costs reputation | இடம் காலியாக இருந்தது: இது நற்பெயரைக் குறைக்கும் | needs native review |
| `msn.passed_waiting` | Passed someone waiting | காத்திருந்தவரைத் தாண்டிவிட்டீர்கள் | needs native review |
| `msn.passenger_in` | Passenger in | பயணி ஏறினார் | needs native review |
| `msn.pay_replay` | replay pays ₹{0} | மீண்டும் விளையாடினால் ₹{0} | needs native review |
| `msn.pay_up_to` | up to ₹{0} | ₹{0} வரை | needs native review |
| `msn.playing_now` | Playing now | இப்போது விளையாடுகிறீர்கள் | needs native review |
| `msn.popcorn` | Popcorn | பாப்கார்ன் | needs native review |
| `msn.price` | ₹{0} | ₹{0} | needs native review |
| `msn.queue_hours` | {0} hours in the queue | வரிசையில் {0} மணி நேரம் | needs native review |
| `msn.rep_plus` | {sp}· reputation +{g} | {sp}· நற்பெயர் +{g} | needs native review |
| `msn.reps_try` | {0} good reps: Selva did four. Try again. | {0} சரியான முறை: செல்வா நான்கு செய்தார். மீண்டும் முயலுங்கள். | needs native review |
| `msn.shift_over` | {0} shift over | {0} ஷிஃப்ட் முடிந்தது | needs native review |
| `msn.sleep` | Sleep until {0} | {0} வரை தூங்கு | needs native review |
| `msn.sleep_detail` | {0} hours · saves the game | {0} மணி நேரம் · ஆட்டம் சேமிக்கப்படும் | needs native review |
| `msn.snack_detail` | ₹{0} · +{1} health | ₹{0} · +{1} உடல்நலம் | needs native review |
| `msn.stage_complete` | Stage {0} complete | நிலை {0} முடிந்தது | needs native review |
| `msn.stage_meta` | {0} · {1}{2} | {0} · {1}{2} | needs native review |
| `msn.stage_notice` | Stage {0}: {1} | நிலை {0}: {1} | needs native review |
| `msn.starts_again` | {0} starts again | {0} மீண்டும் தொடங்குகிறது | needs native review |
| `msn.stop_drop` | Stop here: a passenger gets off | இங்கே நிறுத்துங்கள்: ஒரு பயணி இறங்குகிறார் | needs native review |
| `msn.stop_let_in` | Stop here to let them in | அவர்களை ஏற்ற இங்கே நிறுத்துங்கள் | needs native review |
| `msn.stop_wait` | {0}: wait {1} s | {0}: {1} வினாடி காத்திருங்கள் | needs native review |
| `msn.story_detail` | +₹{0} · {1} | +₹{0} · {1} | needs native review |
| `msn.story_done` | {0}: done | {0}: முடிந்தது | needs native review |
| `msn.story_label` | Story: {0} | கதை: {0} | needs native review |
| `msn.story_over` | {0} is over; ask again at the place | {0} முடிந்துவிட்டது; அந்த இடத்தில் மீண்டும் கேளுங்கள் | needs native review |
| `msn.story_tag` | Story | கதை | needs native review |
| `msn.treat_fee` | ₹{0} at your health | உங்கள் உடல்நிலைக்கு ₹{0} | needs native review |
| `msn.treat_free` | Free after the ambulance | ஆம்புலன்ஸில் வந்ததால் இலவசம் | needs native review |
| `msn.treatment` | Treatment | சிகிச்சை | needs native review |
| `msn.waving` | Someone is waving at the kerb: pull up beside them | யாரோ சாலை ஓரத்தில் கை காட்டுகிறார்கள்: அவர்கள் அருகே நிறுத்துங்கள் | needs native review |
| `msn.wearing` | Wearing: {0} | அணிந்திருப்பது: {0} | needs native review |
| `msn.workout` | Workout: {0} reps | உடற்பயிற்சி: {0} முறை | needs native review |
| `msn.workout_detail` | Day pass ₹{0} · fitness {1}/{2} | ஒரு நாள் அனுமதி ₹{0} · உடல் தகுதி {1}/{2} | needs native review |
| `quality.explain.high` | full resolution, long shadows, full traffic | முழுத் தெளிவுத்திறன், நீண்ட நிழல்கள், முழுப் போக்குவரத்து | needs native review |
| `quality.explain.low` | 65% resolution, flat lighting, less traffic | 65% தெளிவுத்திறன், தட்டை ஒளி, குறைந்த போக்குவரத்து | needs native review |
| `quality.explain.medium` | 80% resolution, short shadows, fewer people | 80% தெளிவுத்திறன், குட்டையான நிழல்கள், குறைவான மக்கள் | needs native review |
| `quality.high` | High | உயர்வு | needs native review |
| `quality.low` | Low | குறைவு | needs native review |
| `quality.medium` | Medium | நடுத்தரம் | needs native review |
| `rail.aspect.green` | green | பச்சை | needs native review |
| `rail.aspect.red` | red | சிவப்பு | needs native review |
| `rail.aspect.yellow` | yellow | மஞ்சள் | needs native review |
| `rail.at` | At {0} | {0}-இல் | needs native review |
| `rail.board_toast` | Train to {0} · ticket ₹{1} · next: {2} | {0} செல்லும் ரயில் · டிக்கெட் ₹{1} · அடுத்தது: {2} | needs native review |
| `rail.cab_title` | {0} · to {1} | {0} · {1} நோக்கி | needs native review |
| `rail.cant_board` | Can't board: {0} | ஏற முடியாது: {0} | needs native review |
| `rail.continues` | The line continues to {0} beyond the map. | இந்தப் பாதை வரைபடத்துக்கு அப்பால் {0} வரை செல்கிறது. | needs native review |
| `rail.driving_to` | You are driving to {0}. Raise the lever when the doors close; stop at the red STOP board. | நீங்கள் {0} நோக்கி ஓட்டுகிறீர்கள். கதவுகள் மூடியதும் லீவரை உயர்த்துங்கள்; சிவப்பு STOP பலகையில் நிறுத்துங்கள். | needs native review |
| `rail.end_of_line` | end of the line | கடைசி நிறுத்தம் | needs native review |
| `rail.every` | {0} · every {1} min | {0} · ஒவ்வொரு {1} நிமிடத்துக்கும் | needs native review |
| `rail.hud.close` | CLOSE | மூடு | needs native review |
| `rail.hud.doors_closed` | Doors closed | கதவுகள் மூடியுள்ளன | needs native review |
| `rail.hud.doors_open` | Doors open | கதவுகள் திறந்துள்ளன | needs native review |
| `rail.hud.drive` | DRIVE | ஓட்டு | needs native review |
| `rail.hud.emg` | EMG | அவசரம் | needs native review |
| `rail.hud.horn` | HORN | ஹாரன் | needs native review |
| `rail.hud.leave_cab` | LEAVE CAB | கேபினை விடு | needs native review |
| `rail.hud.score` | Score {0} | மதிப்பெண் {0} | needs native review |
| `rail.hud.signal` | Signal {0} · limit {1} | சிக்னல் {0} · வரம்பு {1} | needs native review |
| `rail.hud.sit` | SIT | உட்கார் | needs native review |
| `rail.hud.stand` | STAND | எழு | needs native review |
| `rail.hud.step_off` | STEP OFF | இறங்கு | needs native review |
| `rail.hud.timetable` | TIMETABLE | நேரப்பட்டியல் | needs native review |
| `rail.hud.view` | VIEW | பார்வை | needs native review |
| `rail.leave_cab_hint` | Stop at a platform and open the doors to leave the cab. | கேபினிலிருந்து இறங்க, நடைமேடையில் நிறுத்திக் கதவுகளைத் திறங்கள். | needs native review |
| `rail.lines_note` | Lines (headways estimated, not the real timetable): | பாதைகள் (இடைவெளிகள் மதிப்பீடு, உண்மையான நேரப்பட்டியல் அல்ல): | needs native review |
| `rail.next` | Next: {0} | அடுத்தது: {0} | needs native review |
| `rail.next_train` | Next train: {0}, {1} | அடுத்த ரயில்: {0}, {1} | needs native review |
| `rail.no_trains` | No trains | ரயில் இல்லை | needs native review |
| `rail.reason.beyond` | This train's next stop is beyond the map (towards {0}). | இந்த ரயிலின் அடுத்த நிறுத்தம் வரைபடத்துக்கு அப்பால் ({0} பக்கம்). | needs native review |
| `rail.reason.doors_closing` | The doors are closing. | கதவுகள் மூடிக்கொண்டிருக்கின்றன. | needs native review |
| `rail.reason.not_standing` | The train is not standing here. | ரயில் இங்கே நிற்கவில்லை. | needs native review |
| `rail.reason.terminates` | This train terminates here. | இந்த ரயில் இங்கே முடிகிறது. | needs native review |
| `rail.reason.ticket` | A ticket costs ₹{0}. | டிக்கெட் விலை ₹{0}. | needs native review |
| `rail.ride_end` | {0}: end of the ride. {1} | {0}: பயணம் முடிந்தது. {1} | needs native review |
| `rail.row` | {0}   PF {1}   {2}   {3} | {0}   நடைமேடை {1}   {2}   {3} | needs native review |
| `rail.run_score` | Score {0} for this run. | இந்தப் பயணத்தின் மதிப்பெண் {0}. | needs native review |
| `rail.score_line` | {0}{1} {2} | {0}{1} {2} | needs native review |
| `rail.station` | {0} station | {0} நிலையம் | needs native review |
| `rail.status.arriving` | Arriving | வருகிறது | needs native review |
| `rail.status.due` | Due | இதோ வருகிறது | needs native review |
| `rail.status.min` | {0} min | {0} நிமிடம் | needs native review |
| `rail.status.on_platform` | On platform | நடைமேடையில் உள்ளது | needs native review |
| `rail.terminates_at` | This train terminates at {0}. | இந்த ரயில் {0}-இல் முடிகிறது. | needs native review |
| `rail.timetable` | Timetable | நேரப்பட்டியல் | needs native review |
| `rail.to_mark` | {0} m to the stop mark | நிறுத்தக் குறிக்கு {0} மீ | needs native review |
| `rail.train_to` | Train to {0} | {0} செல்லும் ரயில் | needs native review |
| `rail.wait_next` | Wait for the next station: you can step off when the train stops. | அடுத்த நிலையம் வரை காத்திருங்கள்: ரயில் நின்றதும் இறங்கலாம். | needs native review |
| `set.button_opacity` | Button opacity: {0}% | பொத்தான் தெளிவுத்தன்மை: {0}% | needs native review |
| `set.button_size` | Buttons: {0} | பொத்தான்கள்: {0} | needs native review |
| `set.graphics` | Graphics: {0} | கிராஃபிக்ஸ்: {0} | needs native review |
| `set.graphics.auto` | Auto ({0}) | தானியங்கி ({0}) | needs native review |
| `set.invert_y` | Invert look Y: {0} | மேல்-கீழ் பார்வையைத் தலைகீழாக்கு: {0} | needs native review |
| `set.language` | Language: {0} | மொழி: {0} | needs native review |
| `set.left_handed` | Left-handed: {0} | இடக்கை: {0} | needs native review |
| `set.look_speed` | Look speed: {0}x | பார்வை வேகம்: {0}x | needs native review |
| `set.minimap` | Minimap: {0} | சிறு வரைபடம்: {0} | needs native review |
| `set.minimap.north` | north up | வடக்கு மேலே | needs native review |
| `set.minimap.turns` | turns with you | உங்களுடன் திரும்பும் | needs native review |
| `set.off` | Off | ஆஃப் | needs native review |
| `set.on` | On | ஆன் | needs native review |
| `set.perf_overlay` | Performance overlay: {0} | செயல்திறன் திரை: {0} | needs native review |
| `set.run` | Run: {0} | ஓட்டம்: {0} | needs native review |
| `set.run.edge` | push stick to edge | ஸ்டிக்கை ஓரம் வரை தள்ளவும் | needs native review |
| `set.run.tap` | tap RUN | 'ஓடு' பொத்தானைத் தட்டவும் | needs native review |
| `set.size.large` | Large | பெரியது | needs native review |
| `set.size.medium` | Medium | நடுத்தரம் | needs native review |
| `set.size.small` | Small | சிறியது | needs native review |
| `set.sound` | Sound: {0} | ஒலி: {0} | needs native review |
| `set.time` | Time: {0} ({1}) | நேரம்: {0} ({1}) | needs native review |
| `set.vibration` | Vibration: {0} | அதிர்வு: {0} | needs native review |
| `set.weather` | Weather: {0} | வானிலை: {0} | needs native review |
| `sound.more_free` | {0} more recordings are CC0 or public domain (OpenGameArt, Wikimedia Commons); thanks to their authors. | மேலும் {0} ஒலிப்பதிவுகள் CC0 அல்லது பொதுச் சொத்து (OpenGameArt, Wikimedia Commons); அவற்றை உருவாக்கியவர்களுக்கு நன்றி. | needs native review |
| `sound.synth` | The other {0} sounds are synthesised for this game. | மற்ற {0} ஒலிகள் இந்த ஆட்டத்துக்காகவே உருவாக்கப்பட்டவை. | needs native review |
| `sound.thanks` | Sound recordings, with thanks: | ஒலிப்பதிவுகள், நன்றியுடன்: | needs native review |
| `time.evening` | Evening | மாலை | needs native review |
| `time.morning` | Morning | காலை | needs native review |
| `time.night` | Night | இரவு | needs native review |
| `time.noon` | Noon | மதியம் | needs native review |
| `title.back` | BACK | பின் செல் | needs native review |
| `title.continue_line` | {0} · ₹{1} · {2} of {3} stages | {0} · ₹{1} · {3} நிலைகளில் {2} முடிந்தது | needs native review |
| `title.credit_prefix` | Map data | வரைபடத் தரவு | needs native review |
| `title.free_roam` | Free roam | சுதந்திரமாகச் சுற்றலாம் | needs native review |
| `title.name.open_world` | OPEN WORLD | திறந்த உலகம் | needs native review |
| `title.row.about` | ABOUT | பற்றி | needs native review |
| `title.row.continue` | CONTINUE | தொடர் | needs native review |
| `title.row.controls` | CONTROLS | கட்டுப்பாடுகள் | needs native review |
| `title.row.new_game` | NEW GAME | புதிய ஆட்டம் | needs native review |
| `title.row.quit` | QUIT | வெளியேறு | needs native review |
| `title.row.settings` | SETTINGS | அமைப்புகள் | needs native review |
| `title.stage` | Stage {0} | நிலை {0} | needs native review |
| `title.sub.about` | Credits and map data | நன்றியுரையும் வரைபடத் தரவும் | needs native review |
| `title.sub.controls` | Touch controls on foot and driving | நடக்கும்போதும் ஓட்டும்போதும் தொடு கட்டுப்பாடுகள் | needs native review |
| `title.sub.new_game` | Begin in Chennai: Stage 1 | சென்னையில் தொடங்குங்கள்: நிலை 1 | needs native review |
| `title.sub.new_game_named` | Begin in Chennai: Stage 1, {0} | சென்னையில் தொடங்குங்கள்: நிலை 1, {0} | needs native review |
| `title.sub.settings` | Time of day, weather and sound | நேரம், வானிலை, ஒலி | needs native review |
| `title.sub.start_again` | Start again from Stage 1 | நிலை 1-இலிருந்து மீண்டும் தொடங்குங்கள் | needs native review |
| `toast.careful` | Careful | கவனம் | needs native review |
| `toast.drop_back` | Drop back | கொஞ்சம் பின்னால் இருங்கள் | needs native review |
| `toast.graphics_detail` | It ran at {0} fps. Change it in Settings → Graphics. | {0} fps-இல் ஓடியது. அமைப்புகள் → கிராஃபிக்ஸில் மாற்றலாம். | needs native review |
| `toast.graphics_lowered` | Graphics lowered to {0} | கிராஃபிக்ஸ் {0} நிலைக்குக் குறைக்கப்பட்டது | needs native review |
| `toast.heat_detail` | They may remember this | இதை அவர்கள் நினைவில் வைத்திருக்கலாம் | needs native review |
| `toast.heat_raised` | Police heat +{0} | போலீஸ் தேடல் +{0} | needs native review |
| `toast.load_shaking` | The load is shaking: smooth and slow | சுமை ஆடுகிறது: மெதுவாக, சீராக ஓட்டுங்கள் | needs native review |
| `toast.noticing` | He is noticing you | அவர் உங்களைக் கவனிக்கிறார் | needs native review |
| `toast.stop_first` | Stop the vehicle first | முதலில் வண்டியை நிறுத்துங்கள் | needs native review |
| `toast.too_far_take` | Too far to take over | பிடிக்க முடியாத அளவு தொலைவு | needs native review |
| `veh.label.ambulance` | Ambulance | ஆம்புலன்ஸ் | needs native review |
| `veh.label.auto` | Auto-rickshaw | ஆட்டோ | needs native review |
| `veh.label.bike` | Motorbike | மோட்டார் பைக் | needs native review |
| `veh.label.bus` | City bus | நகரப் பேருந்து | needs native review |
| `veh.label.car` | Hatchback | ஹேட்ச்பேக் கார் | needs native review |
| `veh.noun.ambulance` | ambulance | ஆம்புலன்ஸ் | needs native review |
| `veh.noun.auto` | auto-rickshaw | ஆட்டோ | needs native review |
| `veh.noun.bike` | motorbike | மோட்டார் பைக் | needs native review |
| `veh.noun.bus` | city bus | நகரப் பேருந்து | needs native review |
| `veh.noun.car` | hatchback | ஹேட்ச்பேக் கார் | needs native review |
| `weather.clear` | Clear | தெளிவு | needs native review |
| `weather.rain` | Rain | மழை | needs native review |
| `weather.storm` | Storm | இடியுடன் மழை | needs native review |
| `c.missions.morning-walk.title` | Morning walk | காலை நடை | needs native review |
| `c.missions.morning-walk.brief` | Stretch your legs. Walk down the street to the marker. | கொஞ்சம் கால் நீட்டுங்கள். தெருவில் நடந்து இலக்கு வரை போங்கள். | needs native review |
| `c.missions.morning-walk.objectives.0.label` | Walk to the marker | இலக்கு வரை நடந்து செல்லுங்கள் | needs native review |
| `c.missions.borrowed-wheels.title` | Borrowed wheels | இரவல் வண்டி | needs native review |
| `c.missions.borrowed-wheels.brief` | Your cousin left his hatchback on the street. Take it across town to Kilpauk Garden Road. | உங்கள் மச்சான் தன் ஹேட்ச்பேக் காரைத் தெருவில் விட்டுப் போயிருக்கிறார். அதை ஊரின் மறுபக்கம் கீழ்ப்பாக்கம் கார்டன் சாலைக்கு எடுத்துச் செல்லுங்கள். | needs native review |
| `c.missions.borrowed-wheels.objectives.0.label` | Get in the hatchback | ஹேட்ச்பேக் காரில் ஏறுங்கள் | needs native review |
| `c.missions.borrowed-wheels.objectives.1.label` | Drive to Kilpauk Garden Road, Kilpauk | கீழ்ப்பாக்கம் கார்டன் சாலைக்கு ஓட்டிச் செல்லுங்கள், கீழ்ப்பாக்கம் | needs native review |
| `c.missions.auto-shift.title` | Auto shift | ஆட்டோ ஷிஃப்ட் | needs native review |
| `c.missions.auto-shift.brief` | Cover a friend's auto in Perambur for one fare. Pick the passenger up and drop them in Amirthammal Colony before they lose patience. | பெரம்பூரில் நண்பனின் ஆட்டோவை ஒரு சவாரிக்கு ஓட்டுங்கள். பயணியை ஏற்றி, அவர் பொறுமை இழக்கும் முன் அமிர்தம்மாள் காலனியில் இறக்கிவிடுங்கள். | needs native review |
| `c.missions.auto-shift.objectives.0.label` | Get in the auto-rickshaw | ஆட்டோவில் ஏறுங்கள் | needs native review |
| `c.missions.auto-shift.objectives.1.label` | Pick up the passenger | பயணியை ஏற்றுங்கள் | needs native review |
| `c.missions.auto-shift.objectives.2.label` | Drop the passenger | பயணியை இறக்கிவிடுங்கள் | needs native review |
| `c.missions.parcel-run.title` | Parcel run | பார்சல் சவாரி | needs native review |
| `c.missions.parcel-run.brief` | Three parcels, three addresses between Chetpet and Nungambakkam, and the clock is running on each one. | மூன்று பார்சல், சேத்துப்பட்டுக்கும் நுங்கம்பாக்கத்துக்கும் இடையில் மூன்று முகவரிகள்; ஒவ்வொன்றுக்கும் நேரம் ஓடிக்கொண்டிருக்கிறது. | needs native review |
| `c.missions.parcel-run.objectives.0.label` | Get in a car | காரில் ஏறுங்கள் | needs native review |
| `c.missions.parcel-run.objectives.1.label` | Deliver parcel 1 of 3, Mc Nichols Road | 3 பார்சல்களில் முதலாவதைக் கொடுங்கள், மெக்நிக்கல்ஸ் சாலை | needs native review |
| `c.missions.parcel-run.objectives.2.label` | Deliver parcel 2 of 3, Nungambakkam | 3 பார்சல்களில் இரண்டாவதைக் கொடுங்கள், நுங்கம்பாக்கம் | needs native review |
| `c.missions.parcel-run.objectives.3.label` | Deliver parcel 3 of 3, Spur Tank Road | 3 பார்சல்களில் மூன்றாவதைக் கொடுங்கள், ஸ்பர் டேங்க் சாலை | needs native review |
| `c.missions.cross-town.title` | Cross-town dash | ஊரைக் கடக்கும் ஓட்டம் | needs native review |
| `c.missions.cross-town.brief` | Corner to corner across Anna Nagar, as fast as the streets allow. | அண்ணா நகரின் ஒரு முனையிலிருந்து மறு முனை வரை, தெருக்கள் அனுமதிக்கும் வேகத்தில். | needs native review |
| `c.missions.cross-town.objectives.0.label` | Get in a car | காரில் ஏறுங்கள் | needs native review |
| `c.missions.cross-town.objectives.1.label` | Drive to the start line | தொடக்கக் கோட்டுக்கு ஓட்டிச் செல்லுங்கள் | needs native review |
| `c.missions.cross-town.objectives.2.label` | Race to the finish | முடிவுக்கோடு வரை பந்தயமாக ஓட்டுங்கள் | needs native review |
| `c.missions.bike-courier.title` | Two-wheel courier | இருசக்கர கூரியர் | needs native review |
| `c.missions.bike-courier.brief` | Lunch boxes go cold fast. Take the motorbike and make both drops on time. | மதிய உணவுப் பெட்டிகள் சீக்கிரம் ஆறிவிடும். மோட்டார் பைக்கை எடுத்து இரண்டு இடங்களிலும் நேரத்தில் கொடுத்துவிடுங்கள். | needs native review |
| `c.missions.bike-courier.objectives.0.label` | Get on a motorbike | மோட்டார் பைக்கில் ஏறுங்கள் | needs native review |
| `c.missions.bike-courier.objectives.1.label` | Collect the lunch boxes, Jeenis Road, Saidapet | மதிய உணவுப் பெட்டிகளை வாங்குங்கள், ஜீனிஸ் சாலை, சைதாப்பேட்டை | needs native review |
| `c.missions.bike-courier.objectives.2.label` | First drop, Jothiammal Nagar | முதல் இடம், ஜோதியம்மாள் நகர் | needs native review |
| `c.missions.bike-courier.objectives.3.label` | Second drop, Saidapet | இரண்டாவது இடம், சைதாப்பேட்டை | needs native review |
| `c.missions.park-trouble.title` | Park trouble | பூங்காவில் தொல்லை | needs native review |
| `c.missions.park-trouble.brief` | Three thugs are shaking down walkers in Tower Park. No weapons, just fists. Sort them out. | டவர் பூங்காவில் நடப்பவர்களை மூன்று ரவுடிகள் மிரட்டிப் பணம் பறிக்கிறார்கள். ஆயுதம் வேண்டாம், கைகளே போதும். அவர்களைக் கவனித்துக்கொள்ளுங்கள். | needs native review |
| `c.missions.park-trouble.objectives.0.label` | Go to Tower Park | டவர் பூங்காவுக்குச் செல்லுங்கள் | needs native review |
| `c.missions.park-trouble.objectives.1.label` | Beat the three thugs (HIT) | மூன்று ரவுடிகளையும் அடித்து வீழ்த்துங்கள் (அடி) | needs native review |
| `c.missions.bike-thieves.title` | Bike thieves | பைக் திருடர்கள் | needs native review |
| `c.missions.bike-thieves.brief` | A stolen motorbike is being stripped on a back street off Jawaharlal Nehru Road in Vadapalani, and two of the gang are armed. You have a pistol now: FIRE shoots where you look. | வடபழனியில் ஜவஹர்லால் நேரு சாலையை ஒட்டிய ஒரு பின்தெருவில் திருடிய மோட்டார் பைக்கைப் பிரித்துக்கொண்டிருக்கிறார்கள்; கும்பலில் இருவரிடம் ஆயுதம் இருக்கிறது. இப்போது உங்களிடம் ஒரு துப்பாக்கி இருக்கிறது: 'சுடு' நீங்கள் பார்க்கும் இடத்தில் சுடும். | needs native review |
| `c.missions.bike-thieves.objectives.0.label` | Find the thieves, off Jawaharlal Nehru Road | ஜவஹர்லால் நேரு சாலை அருகே திருடர்களைக் கண்டுபிடியுங்கள் | needs native review |
| `c.missions.bike-thieves.objectives.1.label` | Take down the thieves | திருடர்களை வீழ்த்துங்கள் | needs native review |
| `c.missions.bike-thieves.objectives.2.label` | Get on a motorbike | மோட்டார் பைக்கில் ஏறுங்கள் | needs native review |
| `c.missions.bike-thieves.objectives.3.label` | Ride it back to its owner on Arcot Road | ஆற்காடு சாலையில் இருக்கும் அதன் உரிமையாளரிடம் ஓட்டிச் சென்று சேருங்கள் | needs native review |
| `c.missions.godown-raid.title` | Godown raid | கிடங்கு சோதனை | needs native review |
| `c.missions.godown-raid.brief` | The gang keeps its takings in a godown in the Ambattur Industrial Estate, far across town. Four guards, all armed. Use the corners. | கும்பல் தன் வசூல் பணத்தை ஊரின் மறுபக்கம் உள்ள அம்பத்தூர் தொழிற்பேட்டையில் ஒரு கிடங்கில் வைத்திருக்கிறது. நான்கு காவலர்கள், எல்லோரிடமும் ஆயுதம். மூலைகளைப் பயன்படுத்துங்கள். | needs native review |
| `c.missions.godown-raid.objectives.0.label` | Get to the godown, Ambit Park Road, Ambattur | கிடங்குக்குச் செல்லுங்கள், ஆம்பிட் பார்க் சாலை, அம்பத்தூர் | needs native review |
| `c.missions.godown-raid.objectives.1.label` | Clear out the guards | காவலர்களை அகற்றுங்கள் | needs native review |
| `c.missions.roundtana-showdown.title` | Roundtana showdown | ரவுண்டானா மோதல் | needs native review |
| `c.missions.roundtana-showdown.brief` | The boss is waiting at the Roundtana with his best men. End it. | தலைவன் தன் சிறந்த ஆட்களுடன் ரவுண்டானாவில் காத்திருக்கிறான். இதை முடித்துவிடுங்கள். | needs native review |
| `c.missions.roundtana-showdown.objectives.0.label` | Go to the Roundtana | ரவுண்டானாவுக்குச் செல்லுங்கள் | needs native review |
| `c.missions.roundtana-showdown.objectives.1.label` | Defeat the boss and his men | தலைவனையும் அவன் ஆட்களையும் வீழ்த்துங்கள் | needs native review |
| `c.missions.courier-chase.title` | Courier chase | கூரியரைத் துரத்துங்கள் | needs native review |
| `c.missions.courier-chase.brief` | With the boss gone, three gangs want his streets. The Manjal Puli (Yellow Tigers) send a rider down Peters Road in Royapettah with the week's protection money. Take a car and stop him. | தலைவன் போனபின், அவன் தெருக்களுக்கு மூன்று கும்பல்கள் ஆசைப்படுகின்றன. மஞ்சள் புலிகள் அந்த வாரத்தின் மிரட்டல் பணத்துடன் ஒரு ஆளை ராயப்பேட்டை பீட்டர்ஸ் சாலையில் அனுப்புகிறார்கள். ஒரு காரை எடுத்து அவனை நிறுத்துங்கள். | needs native review |
| `c.missions.courier-chase.objectives.0.label` | Go to Peters Road, Royapettah | ராயப்பேட்டை பீட்டர்ஸ் சாலைக்குச் செல்லுங்கள் | needs native review |
| `c.missions.courier-chase.objectives.1.label` | Get in a car | காரில் ஏறுங்கள் | needs native review |
| `c.missions.courier-chase.objectives.2.label` | Wait on Peters Road for the courier | பீட்டர்ஸ் சாலையில் கூரியருக்காகக் காத்திருங்கள் | needs native review |
| `c.missions.courier-chase.objectives.3.label` | Catch the courier: pull up beside him | கூரியரைப் பிடியுங்கள்: அவன் பக்கத்திலேயே ஓட்டிச் செல்லுங்கள் | needs native review |
| `c.missions.courier-chase.objectives.4.label` | Take the money back to the tea shop, Triplicane High Road | பணத்தைத் திருவல்லிக்கேணி நெடுஞ்சாலையில் உள்ள டீக்கடையில் திருப்பிக் கொடுங்கள் | needs native review |
| `c.missions.tea-shop.title` | Protection money | மிரட்டல் பணம் | needs native review |
| `c.missions.tea-shop.brief` | A tea shop owner in the Flower Bazaar paid the Manjal Puli for years. Now the Neela Nandu (Blue Crabs) want a cut too, and four of them are walking up the street. Stand with him. He keeps an old shotgun under the counter for you. | பூ பஜாரில் உள்ள ஒரு டீக்கடைக்காரர் வருடக்கணக்கில் மஞ்சள் புலிகளுக்குப் பணம் கொடுத்து வந்தார். இப்போது நீல நண்டுகளும் பங்கு கேட்கின்றன; அவர்களில் நால்வர் தெருவில் நடந்து வருகிறார்கள். அவருக்குத் துணையாக நில்லுங்கள். உங்களுக்காக அவர் கல்லாவுக்குக் கீழே ஒரு பழைய துப்பாக்கி வைத்திருக்கிறார். | needs native review |
| `c.missions.tea-shop.objectives.0.label` | Wait at the tea shop, Audiappa Naicken Street | டீக்கடையில் காத்திருங்கள், ஆடியப்ப நாயக்கன் தெரு | needs native review |
| `c.missions.tea-shop.objectives.1.label` | Send the racket packing | அந்த மிரட்டல் கும்பலை விரட்டியடியுங்கள் | needs native review |
| `c.missions.drive-by.title` | Hot wheels | சூடான சக்கரங்கள் | needs native review |
| `c.missions.drive-by.brief` | Word is out that you took the Neela Nandu's money. A friend left you a motorbike on KMS Street; the crew is waiting by it. Get on and ride for the Marina beach road. | நீல நண்டுகளின் பணத்தை நீங்கள் எடுத்த செய்தி பரவிவிட்டது. ஒரு நண்பர் உங்களுக்காகக் கே.எம்.எஸ். தெருவில் ஒரு மோட்டார் பைக்கை விட்டுச் சென்றிருக்கிறார்; அதன் அருகிலேயே ஆட்கள் காத்திருக்கிறார்கள். ஏறி மெரினா கடற்கரைச் சாலைக்கு ஓட்டிச் செல்லுங்கள். | needs native review |
| `c.missions.drive-by.objectives.0.label` | Go to KMS Street, Triplicane | கே.எம்.எஸ். தெருவுக்குச் செல்லுங்கள், திருவல்லிக்கேணி | needs native review |
| `c.missions.drive-by.objectives.1.label` | Get on the motorbike | மோட்டார் பைக்கில் ஏறுங்கள் | needs native review |
| `c.missions.drive-by.objectives.2.label` | Ride to the beach road before they get you | அவர்கள் பிடிப்பதற்குள் கடற்கரைச் சாலைக்கு ஓட்டிச் செல்லுங்கள் | needs native review |
| `c.missions.snake-pit.title` | Snake pit | பாம்புப் புற்று | needs native review |
| `c.missions.snake-pit.brief` | The Pachai Paambu (Green Snakes) of Egmore have been arming both sides. Their hideout is a back street off Pantheon Road. Six of them, with shotguns and an SMG. Clear it out. | எழும்பூரின் பச்சைப் பாம்புகள் இரு தரப்புக்கும் ஆயுதம் கொடுத்து வருகின்றன. அவர்களின் மறைவிடம் பாந்தியன் சாலையை ஒட்டிய ஒரு பின்தெரு. ஆறு பேர், துப்பாக்கிகளுடனும் ஒரு SMG-யுடனும். அந்த இடத்தைச் சுத்தம் செய்யுங்கள். | needs native review |
| `c.missions.snake-pit.objectives.0.label` | Find the hideout, Egmore | மறைவிடத்தைக் கண்டுபிடியுங்கள், எழும்பூர் | needs native review |
| `c.missions.snake-pit.objectives.1.label` | Clear out the hideout | மறைவிடத்தைச் சுத்தம் செய்யுங்கள் | needs native review |
| `c.missions.turf-war.title` | Turf war | எல்லைப் போர் | needs native review |
| `c.missions.turf-war.brief` | The Manjal Puli boss has called every crew he has left to the bus junction in T. Nagar to finish this. So have you. | இதை முடித்துவிட, மஞ்சள் புலி தலைவன் மீதமுள்ள எல்லாக் கும்பல்களையும் தி. நகர் பேருந்து சந்திப்புக்கு அழைத்திருக்கிறான். நீங்களும் அங்கே போகிறீர்கள். | needs native review |
| `c.missions.turf-war.objectives.0.label` | Go to the bus junction, T. Nagar | தி. நகர் பேருந்து சந்திப்புக்குச் செல்லுங்கள் | needs native review |
| `c.missions.turf-war.objectives.1.label` | Win the turf war | எல்லைப் போரில் வெல்லுங்கள் | needs native review |
| `c.missions.stadium-biryani.title` | Biryani for the dressing room | டிரெஸ்ஸிங் ரூமுக்கு பிரியாணி | needs native review |
| `c.missions.stadium-biryani.brief` | Match day at Chepauk. A kitchen near Egmore station has forty parcels of biryani for the dressing room and its delivery rider has flu. The toss is soon: ride, and don't stop for tea. | சேப்பாக்கத்தில் போட்டி நாள். எழும்பூர் ரயில் நிலையம் அருகே உள்ள ஒரு சமையலறையில் டிரெஸ்ஸிங் ரூமுக்கான நாற்பது பிரியாணி பார்சல்கள் தயார்; அதை எடுத்துச் செல்லும் ஆளுக்குக் காய்ச்சல். டாஸ் இன்னும் கொஞ்ச நேரத்தில்: வேகமாகப் போங்கள், டீ குடிக்க நிற்காதீர்கள். | needs native review |
| `c.missions.stadium-biryani.objectives.0.label` | Get on a motorbike | மோட்டார் பைக்கில் ஏறுங்கள் | needs native review |
| `c.missions.stadium-biryani.objectives.1.label` | Collect the biryani near Egmore station | எழும்பூர் ரயில் நிலையம் அருகே பிரியாணியை வாங்குங்கள் | needs native review |
| `c.missions.stadium-biryani.objectives.2.label` | Deliver it to the stadium gate, Wallajah Road | அதை மைதான வாசலில் கொடுங்கள், வாலாஜா சாலை | needs native review |
| `c.missions.stadium-biryani.objectives.3.label` | Last box to the scorers, Victoria Hostel Road | கடைசிப் பெட்டியை ஸ்கோர் எழுதுபவர்களிடம் கொடுங்கள், விக்டோரியா ஹாஸ்டல் சாலை | needs native review |
| `c.missions.wedding-party.title` | Muhurtham | முகூர்த்தம் | needs native review |
| `c.missions.wedding-party.brief` | Selvi akka's niece gets married in Mylapore this morning and the hired van never came. Three of the family are waiting on Westcott Road in their silks. Take the auto by the clock tower and get them to the mandapam before the muhurtham. | செல்வி அக்காவின் மருமகளுக்கு இன்று காலை மயிலாப்பூரில் கல்யாணம்; வாடகை வேன் வரவே இல்லை. குடும்பத்தில் மூன்று பேர் பட்டுப்புடவை, வேட்டியுடன் வெஸ்ட்காட் சாலையில் காத்திருக்கிறார்கள். கடிகாரக் கோபுரம் அருகே உள்ள ஆட்டோவை எடுத்து, முகூர்த்தத்துக்குள் அவர்களை மண்டபத்தில் சேர்த்துவிடுங்கள். | needs native review |
| `c.missions.wedding-party.objectives.0.label` | Get in the auto by the clock tower | கடிகாரக் கோபுரம் அருகே உள்ள ஆட்டோவில் ஏறுங்கள் | needs native review |
| `c.missions.wedding-party.objectives.1.label` | Pick up the wedding party on Westcott Road | வெஸ்ட்காட் சாலையில் கல்யாணக் குழுவை ஏற்றுங்கள் | needs native review |
| `c.missions.wedding-party.objectives.2.label` | Get them to the mandapam on North Mada Street, Mylapore | மயிலாப்பூர் வடக்கு மாட வீதியில் உள்ள மண்டபத்தில் அவர்களைச் சேர்த்துவிடுங்கள் | needs native review |
| `c.missions.planted-chain.title` | Hot property | சூடான சொத்து | needs native review |
| `c.missions.planted-chain.brief` | Lakshmi, who sells jasmine by the temple near Elliot's Beach, wants a word. As she talks, someone slips a gold chain into your pocket and a constable starts shouting. Lose the police, then hand the chain in at the temple office. | எலியட்ஸ் கடற்கரை அருகே கோயில் பக்கத்தில் மல்லிகைப்பூ விற்கும் லட்சுமி உங்களிடம் பேச வேண்டும் என்கிறார். அவர் பேசிக்கொண்டிருக்கும்போது யாரோ ஒரு தங்கச் சங்கிலியை உங்கள் பாக்கெட்டில் போட்டுவிடுகிறார்கள்; ஒரு காவலர் கத்தத் தொடங்குகிறார். போலீஸிடமிருந்து தப்பி, சங்கிலியைக் கோயில் அலுவலகத்தில் ஒப்படையுங்கள். | needs native review |
| `c.missions.planted-chain.objectives.0.label` | Meet Lakshmi at her flower stall, Besant Nagar 2nd Avenue | லட்சுமியை அவர் பூக்கடையில் சந்தியுங்கள், பெசன்ட் நகர் 2-வது அவென்யூ | needs native review |
| `c.missions.planted-chain.objectives.1.label` | Someone planted a stolen chain on you: lose the police | யாரோ திருடிய சங்கிலியை உங்கள் மேல் போட்டுவிட்டார்கள்: போலீஸிடமிருந்து தப்புங்கள் | needs native review |
| `c.missions.planted-chain.objectives.2.label` | Hand the chain in at the temple office, Besant Nagar | சங்கிலியைக் கோயில் அலுவலகத்தில் ஒப்படையுங்கள், பெசன்ட் நகர் | needs native review |
| `c.missions.mumbai-mail.title` | The Mumbai Mail | மும்பை மெயில் | needs native review |
| `c.missions.mumbai-mail.brief` | Padma Raghavan, a Carnatic singer with a concert in Mumbai tomorrow, has missed her ride and her train leaves Central soon. A car is parked on North Mada Street. Pick her up on South Mada Street and get her to Chennai Central. | நாளை மும்பையில் கச்சேரி வைத்திருக்கும் கர்நாடக இசைப் பாடகி பத்மா ராகவன் தன் வண்டியைத் தவறவிட்டுவிட்டார்; அவர் ரயில் சென்ட்ரலிலிருந்து இன்னும் கொஞ்ச நேரத்தில் புறப்படுகிறது. வடக்கு மாட வீதியில் ஒரு கார் நிற்கிறது. தெற்கு மாட வீதியில் அவரை ஏற்றிக்கொண்டு சென்னை சென்ட்ரலில் சேர்த்துவிடுங்கள். | needs native review |
| `c.missions.mumbai-mail.objectives.0.label` | Get in the car on North Mada Street | வடக்கு மாட வீதியில் உள்ள காரில் ஏறுங்கள் | needs native review |
| `c.missions.mumbai-mail.objectives.1.label` | Pick up the singer on South Mada Street | தெற்கு மாட வீதியில் பாடகியை ஏற்றுங்கள் | needs native review |
| `c.missions.mumbai-mail.objectives.2.label` | Drop her at Chennai Central, EVR Periyar Salai | அவரைச் சென்னை சென்ட்ரலில் இறக்கிவிடுங்கள், ஈ.வெ.ரா. பெரியார் சாலை | needs native review |
| `c.missions.beach-road-brawl.title` | Beach road brawl | கடற்கரைச் சாலைச் சண்டை | needs native review |
| `c.missions.beach-road-brawl.brief` | A gang is robbing delivery riders on the beach road at Santhome. Five of them, bats and fists. Police patrols are thick on the beach road, so leave the guns holstered and settle it by hand. | சாந்தோம் கடற்கரைச் சாலையில் ஒரு கும்பல் டெலிவரி செய்பவர்களைக் கொள்ளையடிக்கிறது. ஐந்து பேர், பேட்டுகளும் கைகளும். கடற்கரைச் சாலையில் போலீஸ் ரோந்து அதிகம்; துப்பாக்கியை உறையிலேயே வையுங்கள், கைகளாலேயே தீர்த்துவிடுங்கள். | needs native review |
| `c.missions.beach-road-brawl.objectives.0.label` | Go to Kamarajar Salai, the beach road at Santhome | காமராஜர் சாலைக்குச் செல்லுங்கள், சாந்தோம் கடற்கரைச் சாலை | needs native review |
| `c.missions.beach-road-brawl.objectives.1.label` | Beat the gang robbing the riders | டெலிவரி செய்பவர்களைக் கொள்ளையடிக்கும் கும்பலை அடித்து வீழ்த்துங்கள் | needs native review |
| `c.missions.harmonium-thief.title` | The harmonium thief | ஹார்மோனியம் திருடன் | needs native review |
| `c.missions.harmonium-thief.brief` | Padma's accompanist sent her harmonium ahead on a suburban train, and a thief has taken it off at Egmore. Walk to Park station, take the train one stop to Egmore, then catch him on the motorbike outside the station. | பத்மாவின் பக்கவாத்தியக்காரர் அவருடைய ஹார்மோனியத்தை ஒரு புறநகர் ரயிலில் முன்னதாக அனுப்பினார்; எழும்பூரில் ஒரு திருடன் அதை எடுத்துக்கொண்டு போய்விட்டான். பார்க் ரயில் நிலையத்துக்கு நடந்து செல்லுங்கள், ரயிலில் ஒரு நிறுத்தம் தள்ளி எழும்பூர் போங்கள், பிறகு நிலையத்துக்கு வெளியே மோட்டார் பைக்கில் அவனைப் பிடியுங்கள். | needs native review |
| `c.missions.harmonium-thief.objectives.0.label` | Walk to Park station | பார்க் ரயில் நிலையத்துக்கு நடந்து செல்லுங்கள் | needs native review |
| `c.missions.harmonium-thief.objectives.1.label` | Take a train from Park to Chennai Egmore (BOARD on the platform) | பார்க்கிலிருந்து சென்னை எழும்பூருக்கு ரயிலில் செல்லுங்கள் (நடைமேடையில் 'ஏறு') | needs native review |
| `c.missions.harmonium-thief.objectives.2.label` | Step off and get on the motorbike outside Egmore station | இறங்கி, எழும்பூர் நிலையத்துக்கு வெளியே உள்ள மோட்டார் பைக்கில் ஏறுங்கள் | needs native review |
| `c.missions.harmonium-thief.objectives.3.label` | Catch the thief on EVR Periyar Salai | ஈ.வெ.ரா. பெரியார் சாலையில் திருடனைப் பிடியுங்கள் | needs native review |
| `c.missions.harmonium-thief.objectives.4.label` | Bring the harmonium back to Egmore station | ஹார்மோனியத்தை எழும்பூர் நிலையத்துக்குக் கொண்டு வாருங்கள் | needs native review |
| `c.jobs.ambulance-run.title` | Ambulance run | ஆம்புலன்ஸ் ஓட்டம் | needs native review |
| `c.jobs.ambulance-run.brief` | A patient needs a hospital now. Use the SIREN to clear the traffic, and drive smoothly: every bump hurts. | ஒரு நோயாளிக்கு இப்போதே மருத்துவமனை வேண்டும். போக்குவரத்தை விலக்க சைரனைப் பயன்படுத்துங்கள்; மெதுவாக, சீராக ஓட்டுங்கள்: ஒவ்வொரு குலுக்கலும் வலிக்கும். | needs native review |
| `c.jobs.ambulance-run.stops.0.label` | Pick up the patient | நோயாளியை ஏற்றுங்கள் | needs native review |
| `c.jobs.ambulance-run.stops.1.label` | Drive the patient to the hospital | நோயாளியை மருத்துவமனைக்கு ஓட்டிச் செல்லுங்கள் | needs native review |
| `c.jobs.courier.title` | Courier delivery | கூரியர் டெலிவரி | needs native review |
| `c.jobs.courier.brief` | Collect a parcel from the post office and get it across town on the motorbike. No damage earns a bonus. | அஞ்சலகத்தில் ஒரு பார்சலை வாங்கி, மோட்டார் பைக்கில் ஊரின் மறுபக்கம் கொண்டு சேருங்கள். சேதமில்லாமல் கொடுத்தால் போனஸ் கிடைக்கும். | needs native review |
| `c.jobs.courier.stops.0.label` | Collect the parcel at the post office on 8th Street | 8-வது தெருவில் உள்ள அஞ்சலகத்தில் பார்சலை வாங்குங்கள் | needs native review |
| `c.jobs.courier.stops.1.label` | Deliver the parcel on 5th street | 5-வது தெருவில் பார்சலைக் கொடுங்கள் | needs native review |
| `c.jobs.cab-ride.title` | Cab ride | டாக்ஸி சவாரி | needs native review |
| `c.jobs.cab-ride.brief` | A passenger is waiting for a car. The fare goes by distance; a smooth ride earns a tip. | ஒரு பயணி காருக்காகக் காத்திருக்கிறார். கட்டணம் தூரத்தைப் பொறுத்தது; சுமுகமாக ஓட்டினால் டிப்ஸ் கிடைக்கும். | needs native review |
| `c.jobs.cab-ride.stops.0.label` | Pick up the passenger | பயணியை ஏற்றுங்கள் | needs native review |
| `c.jobs.cab-ride.stops.1.label` | Drop the passenger on 4th Avenue (Santhi Colony Road) | பயணியை 4-வது அவென்யூவில் இறக்கிவிடுங்கள் (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.bus-route.title` | Bus route | பேருந்து வழித்தடம் | needs native review |
| `c.jobs.bus-route.brief` | Drive the city bus round its loop. Stop at every stop in order and keep to the timetable. | நகரப் பேருந்தை அதன் வட்டப் பாதையில் ஓட்டுங்கள். ஒவ்வொரு நிறுத்தத்திலும் வரிசையாக நின்று, நேரப்பட்டியலைப் பின்பற்றுங்கள். | needs native review |
| `c.jobs.bus-route.stops.0.label` | Bus stop 1 of 4 on 4th Avenue (Santhi Colony Road) | 4 நிறுத்தங்களில் 1-வது, 4-வது அவென்யூ (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.bus-route.stops.1.label` | Bus stop 2 of 4 on 4th Avenue (Santhi Colony Road) | 4 நிறுத்தங்களில் 2-வது, 4-வது அவென்யூ (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.bus-route.stops.2.label` | Bus stop 3 of 4 on 4th Avenue (Santhi Colony Road) | 4 நிறுத்தங்களில் 3-வது, 4-வது அவென்யூ (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.bus-route.stops.3.label` | Bus stop 4 of 4 on 4th Avenue (Santhi Colony Road) | 4 நிறுத்தங்களில் 4-வது, 4-வது அவென்யூ (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.hospital-transfer.title` | Hospital transfer | மருத்துவமனை மாற்றம் | needs native review |
| `c.jobs.hospital-transfer.brief` | A stable patient needs moving between hospitals for a scan. Less rush, but a smooth ride matters even more. | உடல்நிலை சீராக உள்ள ஒரு நோயாளியை ஸ்கேனுக்காக ஒரு மருத்துவமனையிலிருந்து இன்னொன்றுக்கு மாற்ற வேண்டும். அவசரம் குறைவு, ஆனால் சீரான பயணம் இன்னும் முக்கியம். | needs native review |
| `c.jobs.hospital-transfer.stops.0.label` | Collect the patient at the hospital on 6th Main Road | 6-வது மெயின் ரோட்டில் உள்ள மருத்துவமனையில் நோயாளியை ஏற்றுங்கள் | needs native review |
| `c.jobs.hospital-transfer.stops.1.label` | Transfer to the hospital | நோயாளியை மருத்துவமனையில் சேர்த்துவிடுங்கள் | needs native review |
| `c.jobs.food-delivery.title` | Lunch rush | மதிய உணவு அவசரம் | needs native review |
| `c.jobs.food-delivery.brief` | Three hot lunches from one kitchen to three homes. Ride fast, ride clean. | ஒரே சமையலறையிலிருந்து மூன்று வீடுகளுக்கு மூன்று சூடான மதிய உணவுகள். வேகமாகவும் ஒழுங்காகவும் ஓட்டுங்கள். | needs native review |
| `c.jobs.food-delivery.stops.0.label` | Collect the orders on 2nd Avenue, Anna Nagar West | ஆர்டர்களை வாங்குங்கள், 2-வது அவென்யூ, மேற்கு அண்ணா நகர் | needs native review |
| `c.jobs.food-delivery.stops.1.label` | Delivery 1 of 3 | 3 டெலிவரிகளில் முதலாவது | needs native review |
| `c.jobs.food-delivery.stops.2.label` | Delivery 2 of 3 on 5th street | 3 டெலிவரிகளில் இரண்டாவது, 5-வது தெரு | needs native review |
| `c.jobs.food-delivery.stops.3.label` | Delivery 3 of 3 on 6th Main Road | 3 டெலிவரிகளில் மூன்றாவது, 6-வது மெயின் ரோடு | needs native review |
| `c.jobs.medicine-run.title` | Medicine run | மருந்து சவாரி | needs native review |
| `c.jobs.medicine-run.brief` | A hospital ward has run short. Take a box of medicine from the chemist, quickly. | ஒரு மருத்துவமனை வார்டில் மருந்து தீர்ந்துவிட்டது. மருந்துக் கடையிலிருந்து ஒரு பெட்டி மருந்தை சீக்கிரம் எடுத்துச் செல்லுங்கள். | needs native review |
| `c.jobs.medicine-run.stops.0.label` | Collect the medicine on 1st Main Road | 1-வது மெயின் ரோட்டில் மருந்தை வாங்குங்கள் | needs native review |
| `c.jobs.medicine-run.stops.1.label` | Deliver to the hospital | மருத்துவமனையில் கொடுங்கள் | needs native review |
| `c.jobs.share-auto.title` | Share auto | ஷேர் ஆட்டோ | needs native review |
| `c.jobs.share-auto.brief` | Run a share auto down 2nd Avenue, Thirumangalam to Anna Nagar East. People wave it down anywhere: pull up beside them to let them in (4 seats), and stop where each one asks to get off. Fares are small (about ₹10 plus ₹5 a km each, estimated); missing a drop or passing people by costs reputation. | 2-வது அவென்யூவில் திருமங்கலத்திலிருந்து கிழக்கு அண்ணா நகர் வரை ஒரு ஷேர் ஆட்டோவை ஓட்டுங்கள். மக்கள் எங்கு வேண்டுமானாலும் கை காட்டி நிறுத்துவார்கள்: அவர்கள் பக்கத்தில் நிறுத்தி ஏற்றுங்கள் (4 இருக்கைகள்); ஒவ்வொருவரும் கேட்கும் இடத்தில் நிறுத்தி இறக்குங்கள். கட்டணம் சிறியது (ஒருவருக்கு ஏறத்தாழ ₹10 + கி.மீ.க்கு ₹5, மதிப்பீடு); இறக்க வேண்டிய இடத்தைத் தவறவிட்டாலோ ஆட்களைத் தாண்டிச் சென்றாலோ நற்பெயர் குறையும். | needs native review |
| `c.jobs.share-auto.stops.0.label` | End of the route at Anna Nagar East | வழித்தடத்தின் முடிவு, கிழக்கு அண்ணா நகர் | needs native review |
| `c.jobs.share-auto.share.name` | 2nd Avenue, Anna Nagar West | 2-வது அவென்யூ, மேற்கு அண்ணா நகர் | needs native review |
| `c.jobs.tower-park-visit.title` | Tower Park visitor | டவர் பூங்கா பார்வையாளர் | needs native review |
| `c.jobs.tower-park-visit.brief` | A visitor wants to see Anna Nagar Tower Park before it closes. Take them to the gate. | ஒரு பார்வையாளர் அண்ணா நகர் டவர் பூங்கா மூடுவதற்குள் அதைப் பார்க்க விரும்புகிறார். அவரை வாசலில் கொண்டுபோய்ச் சேருங்கள். | needs native review |
| `c.jobs.tower-park-visit.stops.0.label` | Pick up the visitor on 2nd Avenue, Anna Nagar West | பார்வையாளரை ஏற்றுங்கள், 2-வது அவென்யூ, மேற்கு அண்ணா நகர் | needs native review |
| `c.jobs.tower-park-visit.stops.1.label` | Drop them at Anna Nagar Tower Park | அவரை அண்ணா நகர் டவர் பூங்காவில் இறக்கிவிடுங்கள் | needs native review |
| `c.jobs.evening-bus.title` | Evening bus, the other way | மாலைப் பேருந்து, எதிர்த் திசையில் | needs native review |
| `c.jobs.evening-bus.brief` | The same loop backwards at the busy hour. Tighter timetable, more people waiting. | அதே வட்டப் பாதை, எதிர்த் திசையில், கூட்டமான நேரத்தில். இறுக்கமான நேரப்பட்டியல், காத்திருப்பவர்கள் அதிகம். | needs native review |
| `c.jobs.evening-bus.stops.0.label` | Bus stop 1 of 4 on 4th Avenue (Santhi Colony Road) | 4 நிறுத்தங்களில் 1-வது, 4-வது அவென்யூ (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.evening-bus.stops.1.label` | Bus stop 2 of 4 on 4th Avenue (Santhi Colony Road) | 4 நிறுத்தங்களில் 2-வது, 4-வது அவென்யூ (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.evening-bus.stops.2.label` | Bus stop 3 of 4 on 4th Avenue (Santhi Colony Road) | 4 நிறுத்தங்களில் 3-வது, 4-வது அவென்யூ (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.evening-bus.stops.3.label` | Bus stop 4 of 4 on 4th Avenue (Santhi Colony Road) | 4 நிறுத்தங்களில் 4-வது, 4-வது அவென்யூ (சாந்தி காலனி சாலை) | needs native review |
| `c.jobs.marina-evening.title` | Marina evening drive | மெரினா மாலைப் பயணம் | needs native review |
| `c.jobs.marina-evening.brief` | Take a friend from T. Nagar to Marina Beach for the evening breeze. Anna Salai is jammed at this hour: cross it, don't drive along it. Evenings only (16:00–20:30); the clock starts at the pick-up. | ஒரு நண்பரை தி. நகரிலிருந்து மாலைக் காற்றுக்காக மெரினா கடற்கரைக்கு அழைத்துச் செல்லுங்கள். இந்த நேரத்தில் அண்ணா சாலையில் நெரிசல்: குறுக்கே கடந்து செல்லுங்கள், அதிலேயே ஓட்டாதீர்கள். மாலை நேரத்தில் மட்டும் (16:00–20:30); நண்பரை ஏற்றும்போது நேரம் தொடங்கும். | needs native review |
| `c.jobs.marina-evening.stops.0.label` | Pick up your friend on Sir Thyagaraya Road, T. Nagar | உங்கள் நண்பரை ஏற்றுங்கள், சர் தியாகராய சாலை, தி. நகர் | needs native review |
| `c.jobs.marina-evening.stops.1.label` | Drop them at Marina Beach, on the beach road | அவரை மெரினா கடற்கரையில் கடற்கரைச் சாலையில் இறக்கிவிடுங்கள் | needs native review |
| `c.jobs.marina-evening.avoid.name` | Anna Salai | அண்ணா சாலை | needs native review |
| `c.jobs.egmore-transfer.title` | Egmore hospital transfer | எழும்பூர் மருத்துவமனை மாற்றம் | needs native review |
| `c.jobs.egmore-transfer.brief` | A stable patient moves from a hospital in Egmore to one in Royapettah for treatment, through central Chennai. Use the SIREN; three bumps end the run. | உடல்நிலை சீராக உள்ள ஒரு நோயாளி சிகிச்சைக்காக எழும்பூர் மருத்துவமனையிலிருந்து ராயப்பேட்டை மருத்துவமனைக்கு, சென்னையின் மையப் பகுதி வழியாக மாற்றப்படுகிறார். சைரனைப் பயன்படுத்துங்கள்; மூன்று முறை மோதினால் ஓட்டம் முடிந்துவிடும். | needs native review |
| `c.jobs.egmore-transfer.stops.0.label` | Collect the patient at the hospital on Pantheon Road, Egmore | பாந்தியன் சாலை மருத்துவமனையில் நோயாளியை ஏற்றுங்கள், எழும்பூர் | needs native review |
| `c.jobs.egmore-transfer.stops.1.label` | Transfer to the hospital on Conron Smith Road, Royapettah | கான்ரான் ஸ்மித் சாலை மருத்துவமனையில் சேர்த்துவிடுங்கள், ராயப்பேட்டை | needs native review |
| `c.jobs.mount-road-bus.title` | Mount Road bus | மவுண்ட் ரோடு பேருந்து | needs native review |
| `c.jobs.mount-road-bus.brief` | Drive the bus up Anna Salai from Teynampet towards Thousand Lights, stopping at four real stops in order. Keep to the timetable in the heaviest traffic in town. | தேனாம்பேட்டையிலிருந்து ஆயிரம் விளக்கு நோக்கி அண்ணா சாலையில் பேருந்தை ஓட்டி, நான்கு உண்மையான நிறுத்தங்களில் வரிசையாக நில்லுங்கள். ஊரிலேயே மிக நெரிசலான போக்குவரத்தில் நேரப்பட்டியலைப் பின்பற்றுங்கள். | needs native review |
| `c.jobs.mount-road-bus.stops.0.label` | Bus stop 1 of 4: SIET | 4 நிறுத்தங்களில் 1-வது: SIET | needs native review |
| `c.jobs.mount-road-bus.stops.1.label` | Bus stop 2 of 4: DMS | 4 நிறுத்தங்களில் 2-வது: DMS | needs native review |
| `c.jobs.mount-road-bus.stops.2.label` | Bus stop 3 of 4: US Embassy | 4 நிறுத்தங்களில் 3-வது: அமெரிக்கத் தூதரகம் | needs native review |
| `c.jobs.mount-road-bus.stops.3.label` | Bus stop 4 of 4: Thousand Lights | 4 நிறுத்தங்களில் 4-வது: ஆயிரம் விளக்கு | needs native review |
| `c.gangs.puli.name` | Manjal Puli | மஞ்சள் புலி | needs native review |
| `c.gangs.puli.meaning` | Yellow Tigers | மஞ்சள் புலிகள் | needs native review |
| `c.gangs.nandu.name` | Neela Nandu | நீல நண்டு | needs native review |
| `c.gangs.nandu.meaning` | Blue Crabs | நீல நண்டுகள் | needs native review |
| `c.gangs.paambu.name` | Pachai Paambu | பச்சைப் பாம்பு | needs native review |
| `c.gangs.paambu.meaning` | Green Snakes | பச்சைப் பாம்புகள் | needs native review |
| `c.places.home.name` | Home | வீடு | needs native review |
| `c.places.hospital.name` | Sugam Hospital | சுகம் மருத்துவமனை | needs native review |
| `c.places.gym.name` | Thol Power Gym | தோள் பவர் ஜிம் | needs native review |
| `c.places.mall.name` | Vaanavil Mall | வானவில் மால் | needs native review |
| `c.places.cinema.name` | Minnal Cinemas | மின்னல் சினிமாஸ் | needs native review |
| `c.stories.paati-checkup.title` | Paati's check-up | பாட்டியின் மருத்துவப் பரிசோதனை | needs native review |
| `c.stories.paati-checkup.brief` | Your grandmother has a check-up at Sugam Hospital and has been ready since six in the morning. Drive her there, and home again before her TV serial starts. | உங்கள் பாட்டிக்கு சுகம் மருத்துவமனையில் பரிசோதனை; காலை ஆறு மணியிலிருந்தே தயாராக இருக்கிறார். அவரை அங்கே கூட்டிச் சென்று, அவருடைய டிவி சீரியல் தொடங்கும் முன் வீட்டுக்குக் கொண்டுவந்து சேருங்கள். | needs native review |
| `c.stories.paati-checkup.ending` | Paati gives you ₹400 and the rest of her tiffin. The doctor's advice for you: fewer vadas. | பாட்டி உங்களுக்கு ₹400-உம் மீதமுள்ள டிஃபனும் தருகிறார். மருத்துவர் உங்களுக்குச் சொன்ன அறிவுரை: வடை கொஞ்சம் குறையுங்கள். | needs native review |
| `c.stories.paati-checkup.steps.0.label` | Get in a car: Paati is waiting | காரில் ஏறுங்கள்: பாட்டி காத்திருக்கிறார் | needs native review |
| `c.stories.paati-checkup.steps.1.label` | Drive Paati to Sugam Hospital. Gently: she is holding a tiffin box | பாட்டியை சுகம் மருத்துவமனைக்கு ஓட்டிச் செல்லுங்கள். மெதுவாக: அவர் டிஃபன் பாக்ஸைப் பிடித்திருக்கிறார் | needs native review |
| `c.stories.paati-checkup.steps.2.label` | Walk Paati in for her check-up (ENTER Sugam Hospital) | பாட்டியைப் பரிசோதனைக்கு உள்ளே கூட்டிச் செல்லுங்கள் (சுகம் மருத்துவமனையில் 'உள்ளே செல்') | needs native review |
| `c.stories.paati-checkup.steps.3.label` | Drive Paati home before her serial starts | சீரியல் தொடங்கும் முன் பாட்டியை வீட்டுக்குக் கூட்டிச் செல்லுங்கள் | needs native review |
| `c.stories.gym-bet.title` | Selva's gym bet | செல்வாவின் ஜிம் பந்தயம் | needs native review |
| `c.stories.gym-bet.brief` | Your friend Selva bets you can't match his four good reps, then beat him to the juice shop on foot. Loser buys the sugarcane juice. | உங்கள் நண்பர் செல்வா, தன்னுடைய நான்கு சரியான முறைகளுக்கு நீங்கள் ஈடுகொடுக்க முடியாது என்றும், பிறகு நடந்தே ஜூஸ் கடைக்கு அவரை முந்த முடியாது என்றும் பந்தயம் கட்டுகிறார். தோற்றவர் கரும்புச் சாறு வாங்கித் தர வேண்டும். | needs native review |
| `c.stories.gym-bet.ending` | Selva pays for the juice and the bet, and books a rematch for next week. | செல்வா ஜூஸுக்கும் பந்தயத்துக்கும் பணம் கொடுத்து, அடுத்த வாரம் மறுபோட்டிக்குத் தேதி வைக்கிறார். | needs native review |
| `c.stories.gym-bet.steps.0.label` | Match Selva: 4 good reps out of 5 (in the gym) | செல்வாவுக்கு ஈடு கொடுங்கள்: 5-இல் 4 சரியான முறை (ஜிம்மில்) | needs native review |
| `c.stories.gym-bet.steps.1.label` | Race Selva to the juice shop, on foot | செல்வாவுடன் நடந்தே ஜூஸ் கடைக்குப் பந்தயம் ஓடுங்கள் | needs native review |
| `c.stories.first-show.title` | First day, first show | முதல் நாள், முதல் காட்சி | needs native review |
| `c.stories.first-show.brief` | Ravi got two tickets for the first show of a new film at Minnal Cinemas. Pick him up on the motorbike and get there before the hero's entry. | ரவிக்கு மின்னல் சினிமாஸில் புதுப் படத்தின் முதல் காட்சிக்கு இரண்டு டிக்கெட் கிடைத்திருக்கிறது. மோட்டார் பைக்கில் அவரை ஏற்றிக்கொண்டு, ஹீரோ என்ட்ரிக்கு முன் அங்கே போய்ச் சேருங்கள். | needs native review |
| `c.stories.first-show.ending` | Ravi pays you back for the petrol. He has already booked the second show. | ரவி பெட்ரோல் செலவைத் திருப்பிக் கொடுக்கிறார். இரண்டாவது காட்சிக்கும் ஏற்கெனவே டிக்கெட் எடுத்துவிட்டார். | needs native review |
| `c.stories.first-show.steps.0.label` | Get on a motorbike: the show starts soon | மோட்டார் பைக்கில் ஏறுங்கள்: காட்சி சீக்கிரம் தொடங்கப் போகிறது | needs native review |
| `c.stories.first-show.steps.1.label` | Pick up Ravi (he is still choosing a shirt) | ரவியை ஏற்றுங்கள் (அவர் இன்னும் சட்டை தேர்ந்தெடுத்துக்கொண்டிருக்கிறார்) | needs native review |
| `c.stories.first-show.steps.2.label` | Ride to Minnal Cinemas before the hero's entry | ஹீரோ என்ட்ரிக்கு முன் மின்னல் சினிமாஸ் வரை ஓட்டிச் செல்லுங்கள் | needs native review |
| `c.stories.first-show.steps.3.label` | Go in for the first show (ENTER Minnal Cinemas) | முதல் காட்சிக்கு உள்ளே போங்கள் (மின்னல் சினிமாஸில் 'உள்ளே செல்') | needs native review |
| `c.missions.hall-ticket.where` | Triplicane | திருவல்லிக்கேணி | needs native review |
| `c.missions.hall-ticket.title` | Hall Ticket | ஹால் டிக்கெட் | needs native review |
| `c.missions.hall-ticket.brief` | A student's entrance exam starts at nine and the gates shut on the stroke. The lodge to the exam centre on Greams Road is across the city at rush hour. Get there on time, and if the gate has shut, the side gate on Pathari Road stays open for a few minutes more. | ஒரு மாணவனின் நுழைவுத் தேர்வு ஒன்பது மணிக்குத் தொடங்குகிறது; மணி அடிக்கும்போதே வாசல் மூடிவிடும். தங்கும் விடுதியிலிருந்து கிரீம்ஸ் சாலையில் உள்ள தேர்வு மையம் ஊரின் மறுபக்கம், அதுவும் அலுவலக நேர நெரிசலில். நேரத்துக்குப் போய்ச் சேருங்கள்; வாசல் மூடியிருந்தால், பத்தாரி சாலையில் உள்ள பக்கவாட்டு வாசல் இன்னும் சில நிமிடங்கள் திறந்திருக்கும். | needs native review |
| `c.missions.hall-ticket.quietZones.0.label` | Hospital zone: no horns | மருத்துவமனைப் பகுதி: ஹாரன் கூடாது | needs native review |
| `c.missions.hall-ticket.goals.early.label` | Reach the gate with 2 minutes to spare | 2 நிமிடம் மீதமிருக்கும்போது வாசலை அடையுங்கள் | needs native review |
| `c.missions.hall-ticket.goals.quiet.label` | No horn in the hospital zone | மருத்துவமனைப் பகுதியில் ஹாரன் அடிக்கக் கூடாது | needs native review |
| `c.missions.hall-ticket.goals.clean.label` | No crashes | மோதல் கூடாது | needs native review |
| `c.missions.hall-ticket.objectives.0.label` | Get in the auto outside the lodge | விடுதிக்கு வெளியே உள்ள ஆட்டோவில் ஏறுங்கள் | needs native review |
| `c.missions.hall-ticket.objectives.1.label` | Pick up the student at the lodge | விடுதியில் மாணவனை ஏற்றுங்கள் | needs native review |
| `c.missions.hall-ticket.objectives.2.label` | Drive to the exam centre gate, Greams Road | தேர்வு மைய வாசலுக்கு ஓட்டிச் செல்லுங்கள், கிரீம்ஸ் சாலை | needs native review |
| `c.missions.hall-ticket.objectives.side.label` | The gate has shut: run to the side gate, Pathari Road | வாசல் மூடிவிட்டது: பக்கவாட்டு வாசலுக்கு ஓடுங்கள், பத்தாரி சாலை | needs native review |
| `c.missions.sambar-sixty.where` | Mylapore | மயிலாப்பூர் | needs native review |
| `c.missions.sambar-sixty.title` | Sambar for Sixty | அறுபது பேருக்குச் சாம்பார் | needs native review |
| `c.missions.sambar-sixty.brief` | Sixty guests, one wedding hall, and a vessel of sambar that must arrive hot and not half-spilled. The lane through the back streets is short and rough; the main road is smooth and long. Watch the stability meter: every breaker and pothole takes some. | அறுபது விருந்தினர், ஒரு கல்யாண மண்டபம், சூடாகவும் பாதி சிந்தாமலும் போய்ச் சேர வேண்டிய ஒரு பாத்திரச் சாம்பார். பின்தெருக்கள் வழியாகப் போகும் சந்து குறுகியது, கரடுமுரடானது; பிரதான சாலை சீரானது, ஆனால் நீளமானது. நிலைத்தன்மை அளவைக் கவனியுங்கள்: ஒவ்வொரு வேகத்தடையும் குழியும் கொஞ்சம் குறைக்கும். | needs native review |
| `c.missions.sambar-sixty.goals.intact.label` | Arrive with the vessel over 90% intact | பாத்திரம் 90%-க்கு மேல் சேதமில்லாமல் போய்ச் சேருங்கள் | needs native review |
| `c.missions.sambar-sixty.goals.hot.label` | Arrive with 90 seconds to spare | 90 வினாடி மீதமிருக்கும்போது போய்ச் சேருங்கள் | needs native review |
| `c.missions.sambar-sixty.objectives.0.label` | Get in the goods auto behind the caterer's | சமையல்காரர் கடைக்குப் பின்னால் இருக்கும் சரக்கு ஆட்டோவில் ஏறுங்கள் | needs native review |
| `c.missions.sambar-sixty.objectives.1.label` | Load the sambar vessel at the caterer's kitchen | சமையலறையில் சாம்பார் பாத்திரத்தை ஏற்றுங்கள் | needs native review |
| `c.missions.sambar-sixty.objectives.2.label` | Deliver the vessel to the wedding hall, Venkatakrishna Road | பாத்திரத்தைக் கல்யாண மண்டபத்தில் சேர்த்துவிடுங்கள், வேங்கடகிருஷ்ணா சாலை | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.0.label` | speed breaker | வேகத்தடை | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.1.label` | pothole | குழி | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.2.label` | speed breaker | வேகத்தடை | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.3.label` | pothole | குழி | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.4.label` | speed breaker | வேகத்தடை | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.5.label` | pothole | குழி | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.6.label` | pothole | குழி | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.7.label` | speed breaker | வேகத்தடை | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.8.label` | pothole | குழி | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.9.label` | pothole | குழி | needs native review |
| `c.missions.sambar-sixty.objectives.2.rough.10.label` | pothole | குழி | needs native review |
| `c.missions.wrong-number.where` | Thousand Lights | ஆயிரம் விளக்கு | needs native review |
| `c.missions.wrong-number.title` | Wrong Number | தவறான எண் | needs native review |
| `c.missions.wrong-number.brief` | A call to the wrong number, and a stranger's voice sounding afraid: a parcel runner is carrying something that is not his, and he keeps changing scooters. Follow him down Mount Road without being noticed, then decide what to do with what you learn. | தவறான எண்ணுக்கு ஒரு அழைப்பு; யாரோ ஒருவரின் குரலில் பயம்: ஒரு பார்சல் ஓட்டுநர் தனக்குச் சொந்தமில்லாத ஏதோ ஒன்றை எடுத்துச் செல்கிறான், ஸ்கூட்டர்களை மாற்றிக்கொண்டே இருக்கிறான். அவனைக் கவனிக்கப்படாமல் மவுண்ட் ரோடு வழியாகப் பின்தொடருங்கள்; பிறகு தெரிந்ததை வைத்து என்ன செய்வது என்று முடிவு செய்யுங்கள். | needs native review |
| `c.missions.wrong-number.goals.unseen.label` | Never more than 40% suspicion | சந்தேகம் ஒருபோதும் 40%-ஐத் தாண்டக் கூடாது | needs native review |
| `c.missions.wrong-number.goals.clean.label` | No crashes | மோதல் கூடாது | needs native review |
| `c.missions.wrong-number.goals.quick.label` | Finish in 10 minutes | 10 நிமிடத்தில் முடியுங்கள் | needs native review |
| `c.missions.wrong-number.objectives.0.label` | Get on the motorbike | மோட்டார் பைக்கில் ஏறுங்கள் | needs native review |
| `c.missions.wrong-number.objectives.1.label` | Wait at the junction on Mount Road where the runner appears | ஓட்டுநர் தோன்றும் மவுண்ட் ரோடு சந்திப்பில் காத்திருங்கள் | needs native review |
| `c.missions.wrong-number.objectives.2.label` | Follow the parcel runner to the drop-off, unseen | பார்சல் ஓட்டுநரைக் கவனிக்கப்படாமல் அவன் இறக்கும் இடம் வரை பின்தொடருங்கள் | needs native review |
| `c.missions.wrong-number.objectives.2.pauses.0.label` | He swaps scooters in a side lane | அவன் ஒரு பக்கச் சந்தில் ஸ்கூட்டரை மாற்றுகிறான் | needs native review |
| `c.missions.wrong-number.objectives.2.pauses.1.label` | He swaps scooters in a side lane | அவன் ஒரு பக்கச் சந்தில் ஸ்கூட்டரை மாற்றுகிறான் | needs native review |
| `c.missions.wrong-number.objectives.2.pauses.2.label` | He swaps scooters in a side lane | அவன் ஒரு பக்கச் சந்தில் ஸ்கூட்டரை மாற்றுகிறான் | needs native review |
| `c.missions.wrong-number.objectives.3.label` | He has dropped the envelope. What now? | அவன் உறையைப் போட்டுவிட்டுப் போய்விட்டான். இப்போது என்ன செய்வது? | needs native review |
| `c.missions.wrong-number.objectives.3.options.report.label` | Report it to the police station | காவல் நிலையத்தில் புகார் செய்யுங்கள் | needs native review |
| `c.missions.wrong-number.objectives.3.options.report.detail` | Reputation up, a small reward. | நற்பெயர் கூடும், சிறு வெகுமதி கிடைக்கும். | needs native review |
| `c.missions.wrong-number.objectives.3.options.take.label` | Take the envelope | உறையை எடுத்துக்கொள்ளுங்கள் | needs native review |
| `c.missions.wrong-number.objectives.3.options.take.detail` | More money, and a star of police heat. Something later reacts. | அதிகப் பணம், ஒரு நட்சத்திர போலீஸ் தேடல். பின்னால் ஏதோ ஒன்று எதிர்வினையாற்றும். | needs native review |
| `c.missions.wrong-number.objectives.station.label` | Take it to the police station, Nandanam Main Road | காவல் நிலையத்தில் ஒப்படையுங்கள், நந்தனம் மெயின் ரோடு | needs native review |
| `c.missions.monsoon-night.where` | Santhome | சாந்தோம் | needs native review |
| `c.missions.monsoon-night.title` | Monsoon Night | பருவமழை இரவு | needs native review |
| `c.missions.monsoon-night.brief` | The northeast monsoon has broken over the coast and a patient needs the hospital in Alwarpet. The shortest road floods first; the minimap shows the water. Re-route early and drive smoothly: the patient feels every jolt. | வடகிழக்குப் பருவமழை கடற்கரைப் பகுதியில் கொட்டத் தொடங்கிவிட்டது; ஒரு நோயாளிக்கு ஆழ்வார்பேட்டை மருத்துவமனை வேண்டும். குறுகிய சாலைதான் முதலில் வெள்ளத்தில் மூழ்கும்; சிறு வரைபடம் தண்ணீரைக் காட்டும். சீக்கிரமே வழியை மாற்றுங்கள், சீராக ஓட்டுங்கள்: நோயாளி ஒவ்வொரு குலுக்கலையும் உணர்வார். | needs native review |
| `c.missions.monsoon-night.goals.health.label` | Patient health above 70% | நோயாளியின் உடல்நலம் 70%-க்கு மேல் இருக்க வேண்டும் | needs native review |
| `c.missions.monsoon-night.goals.clean.label` | No crashes | மோதல் கூடாது | needs native review |
| `c.missions.monsoon-night.objectives.0.label` | Get in the ambulance | ஆம்புலன்ஸில் ஏறுங்கள் | needs native review |
| `c.missions.monsoon-night.objectives.1.label` | Pick up the patient on Santhome High Road | சாந்தோம் நெடுஞ்சாலையில் நோயாளியை ஏற்றுங்கள் | needs native review |
| `c.missions.monsoon-night.objectives.2.label` | Take the patient to the hospital, TTK Road | நோயாளியை மருத்துவமனைக்குக் கொண்டு செல்லுங்கள், டி.டி.கே. சாலை | needs native review |
| `c.missions.monsoon-night.objectives.2.hazards.0.label` | Underpass on the shortest road | குறுகிய சாலையில் உள்ள சுரங்கப்பாதை | needs native review |
| `c.missions.monsoon-night.objectives.2.hazards.1.label` | Low junction ahead | முன்னால் தாழ்வான சந்திப்பு | needs native review |
| `c.missions.monsoon-night.objectives.2.hazards.2.label` | The long way floods last | நீளமான வழிதான் கடைசியில் மூழ்கும் | needs native review |
| `c.missions.the-bandh.where` | Egmore | எழும்பூர் | needs native review |
| `c.missions.the-bandh.title` | The Bandh | பந்த் | needs native review |
| `c.missions.the-bandh.brief` | A general strike has shut the main roads and every shop. Three urgent deliveries must still cross the city before noon, and the only doors open are the back ones. Use the lanes and the beach road; the shut roads show red on the minimap. | ஒரு பொது வேலைநிறுத்தம் பிரதான சாலைகளையும் எல்லாக் கடைகளையும் மூடிவிட்டது. இருந்தாலும் மூன்று அவசரப் பார்சல்கள் மதியத்துக்குள் ஊரைக் கடந்தாக வேண்டும்; திறந்திருப்பவை பின்வாசல்கள் மட்டுமே. சந்துகளையும் கடற்கரைச் சாலையையும் பயன்படுத்துங்கள்; மூடிய சாலைகள் சிறு வரைபடத்தில் சிவப்பாகத் தெரியும். | needs native review |
| `c.missions.the-bandh.briefIf.took_envelope` | The envelope's owners know your bike now. Keep clear of the police. | உறையின் சொந்தக்காரர்களுக்கு இப்போது உங்கள் பைக் தெரிந்துவிட்டது. போலீஸிடமிருந்து விலகியிருங்கள். | needs native review |
| `c.missions.the-bandh.goals.quiet.label` | No police attention | போலீஸ் கவனம் கூடாது | needs native review |
| `c.missions.the-bandh.goals.clean.label` | No crashes | மோதல் கூடாது | needs native review |
| `c.missions.the-bandh.goals.fast.label` | All three delivered in 12 minutes | மூன்றையும் 12 நிமிடத்தில் கொடுத்துவிடுங்கள் | needs native review |
| `c.missions.the-bandh.objectives.0.label` | Get on the motorbike behind the depot | கிடங்குக்குப் பின்னால் உள்ள மோட்டார் பைக்கில் ஏறுங்கள் | needs native review |
| `c.missions.the-bandh.objectives.1.label` | Collect the three urgent parcels at the depot's back door, Pantheon Road | கிடங்கின் பின்வாசலில் மூன்று அவசரப் பார்சல்களை வாங்குங்கள், பாந்தியன் சாலை | needs native review |
| `c.missions.the-bandh.objectives.1.hazards.0.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.1.hazards.1.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.1.hazards.2.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.2.label` | Back door 1, Bharathi Salai: the medicine | பின்வாசல் 1, பாரதி சாலை: மருந்து | needs native review |
| `c.missions.the-bandh.objectives.2.hazards.0.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.2.hazards.1.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.2.hazards.2.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.3.label` | Back door 2, Buchi Babu Street: the lunch box | பின்வாசல் 2, புச்சிபாபு தெரு: மதிய உணவுப் பெட்டி | needs native review |
| `c.missions.the-bandh.objectives.3.hazards.0.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.3.hazards.1.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.3.hazards.2.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.4.label` | Back door 3, the beach road: the parcel | பின்வாசல் 3, கடற்கரைச் சாலை: பார்சல் | needs native review |
| `c.missions.the-bandh.objectives.4.hazards.0.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.4.hazards.1.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
| `c.missions.the-bandh.objectives.4.hazards.2.label` | Bandh: road shut | பந்த்: சாலை மூடப்பட்டுள்ளது | needs native review |
