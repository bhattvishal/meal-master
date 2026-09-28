// Interface text in English, Hindi and Marathi. Recipe text comes translated from Notion.

export const LANGS = {
  en: { label: 'English', locale: 'en-IN' },
  hi: { label: 'हिन्दी', locale: 'hi-IN-u-nu-latn' },
  mr: { label: 'मराठी', locale: 'mr-IN-u-nu-latn' },
};

const STRINGS = {
  en: {
    breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
    protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fibre: 'Fibre', calories: 'Calories',
    today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday',
    lateNight: 'Late night', goodMorning: 'Good morning', goodAfternoon: 'Good afternoon', goodEvening: 'Good evening',
    nextUp: 'Next up', letsEat: 'Let’s eat well.',
    ledePlanned: '{n} of 3 meals planned today', ledeKcal: ', about {kcal} kcal',
    ledeNext: 'Nothing planned for today. Next up: {meal}, {day}.',
    ledeEmpty: 'Nothing planned yet. Add meals to your Notion schedule and they will show up here.',
    todaysMeals: 'Today’s meals', thisWeek: 'This week', weekOf: 'Week of',
    proteinToday: 'grams of protein today', mealsPlannedToday: 'meals planned today',
    comingUp: 'Coming up · {day}', seeAll: 'See all →', notPlanned: 'Not planned', nothingPlanned: 'Nothing planned',
    planInNotion: 'Plan it in Notion', with: 'with', viewRecipe: 'View recipe →', alsoPlanned: 'Also planned',
    jumpToday: 'Jump to today', prevDay: 'Previous day', nextDay: 'Next day', prevWeek: 'Previous week', nextWeek: 'Next week',
    noMeal: 'No {meal} planned', backToDay: 'Back to the day', thisMeal: 'This meal',
    perPerson: 'Per person', someEstimates: 'Some values are estimates', keepScreen: 'Keep screen on while cooking',
    main: 'Main', side: 'Side', min: 'min', gProtein: 'g protein',
    amountsWritten: 'Amounts as written', amountsScaled: 'Amounts scaled from {from} to {to}',
    amountsNoServes: 'Amounts as written (no serving count in Notion)', noRecipe: 'No recipe written yet.',
    openNotion: 'Open in Notion', ingredients: 'Ingredients', method: 'Method',
    mealsPlanned: 'Meals planned', proteinWeek: 'Protein this week', caloriesWeek: 'Calories this week', gProteinDay: '{n} g protein',
    groceryList: 'Grocery list', next3: 'Next 3 days', next7: 'Next 7 days', nextWeekChip: 'Next week',
    earlier: 'Earlier', later: 'Later', meals: 'meals', items: 'items', inBasket: 'in the basket',
    share: 'Share list', shareMeal: 'Share meal', shareWith: 'With', shareNote: 'Note', shareRecipe: 'Share with recipe', shareRecipeLine: 'Recipe', clear: 'Clear ticks', copied: 'Copied!', noMealsDays: 'No meals planned in these days.',
    showUsedIn: 'Show used in', hideUsedIn: 'Hide used in',
    inPantry: 'Already in your pantry', inPantryShort: 'in the pantry', allInPantry: 'You have everything for these days.',
    inPantryHelp: 'Marked In stock in the Notion Pantry, so they are left off the list. Change one to Running low or Out of stock to add it back.',
    pantryLow: 'Running low', pantryOut: 'Out of stock', restock: 'Restock', haveQty: 'have {qty}', editPantry: 'Pantry',
    amountsFor: 'Amounts are for {people}. Recipes without a serving count in Notion are listed without amounts.',
    person: '{n} person', people: '{n} people', fewer: 'Fewer people', more: 'More people',
    synced: 'Synced from {src} {when}', notion: 'Notion', snapshot: 'a saved snapshot', editNotion: 'Edit in Notion',
    rDaily: 'Every day', rWeekdays: 'Every weekday', rWeekends: 'Every weekend', rWeekly: 'Every week', draft: 'Claude draft',
    tabPrep: 'Prep', prepEyebrow: 'Prep ahead', prepTitle: 'Soak, sprout & set', prep2: 'Next 2 days', prep4: 'Next 4 days', prep7: 'Next 7 days',
    prepTasks: 'tasks', prepDoneCount: 'done', prepNow: 'Do now', tonight: 'Tonight', thisMorning: 'This morning', thisAfternoon: 'This afternoon',
    tomorrowMorning: 'Tomorrow morning', tomorrowAfternoon: 'Tomorrow afternoon', tomorrowEvening: 'Tomorrow evening',
    partMorning: 'morning', partAfternoon: 'afternoon', partEvening: 'evening',
    prepBy: 'by {time}', prepBefore: 'before {time}', prepFor: 'for {meal} · {dish}', prepNone: 'Nothing to soak or sprout ahead for these days.',
    prepSoak: 'Soak {what}', prepSproutSoak: 'Soak whole moong to sprout, for {what}', prepSproutDrain: 'Drain the soaked moong, rinse, and tie it in a damp cloth to sprout',
    prepHelp: 'Found in the recipes: soaked ingredients, sprouts and steps that take hours. Write your own in a dish’s "Prep ahead" column in Notion, like "Night before: Soak rajma".',
    prepChip: '{n} things to prep', prepChipOne: '1 thing to prep',
    tabToday: 'Today', tabHome: 'Home', tabShop: 'Shop', tabWeek: 'Week', tabSettings: 'Settings',
    settings: 'Settings', language: 'Language',
    languageHelp: 'Recipes appear in this language when Notion has a translation, otherwise in English.',
    household: 'Household', householdHelp: 'Recipe amounts and the grocery list are scaled for this many people.',
    appearance: 'Appearance', system: 'Automatic', light: 'Light', dark: 'Dark',
    whatsapp: 'WhatsApp at 6 am', whatsappHelp: 'Every morning at 6 am, each person in the WhatsApp Recipients list in Notion gets one message per meal, in their chosen language.',
    whatsappEdit: 'Edit recipients in Notion',
    goalOf: '{pct}% of {goal}', dailyGoals: 'Daily goals', resetGoals: 'Reset to defaults',
    dailyGoalsHelp: 'Per person per day. Protein and fibre are targets to reach; calories, carbs and fat are limits to stay under.',
    proteinGoalLine: '{pct}% of the {goal} g protein goal',
    dataTitle: 'Your data', lastSynced: 'Last synced', couldntLoad: 'Couldn’t load your meals', tryAgain: 'Try again',
    'Vegetables & herbs': 'Vegetables & herbs', Fruit: 'Fruit', Dairy: 'Dairy', 'Pulses, grains & flours': 'Pulses, grains & flours',
    'Nuts & seeds': 'Nuts & seeds', 'Spices & pantry': 'Spices & pantry', Other: 'Other',
  },
  hi: {
    breakfast: 'नाश्ता', lunch: 'दोपहर का खाना', dinner: 'रात का खाना', snack: 'स्नैक',
    protein: 'प्रोटीन', carbs: 'कार्ब्स', fat: 'वसा', fibre: 'फ़ाइबर', calories: 'कैलोरी',
    today: 'आज', tomorrow: 'कल', yesterday: 'बीता कल',
    lateNight: 'शुभ रात्रि', goodMorning: 'सुप्रभात', goodAfternoon: 'नमस्ते', goodEvening: 'शुभ संध्या',
    nextUp: 'अगला', letsEat: 'आइए अच्छा खाएँ।',
    ledePlanned: 'आज 3 में से {n} भोजन तय हैं', ledeKcal: ', लगभग {kcal} कैलोरी',
    ledeNext: 'आज के लिए कुछ तय नहीं है। अगला: {meal}, {day}।',
    ledeEmpty: 'अभी कुछ तय नहीं है। Notion में भोजन जोड़ें, वे यहाँ दिखेंगे।',
    todaysMeals: 'आज का खाना', thisWeek: 'यह हफ़्ता', weekOf: 'हफ़्ता',
    proteinToday: 'ग्राम प्रोटीन आज', mealsPlannedToday: 'भोजन आज तय',
    comingUp: 'आगे · {day}', seeAll: 'सब देखें →', notPlanned: 'तय नहीं', nothingPlanned: 'कुछ तय नहीं',
    planInNotion: 'Notion में तय करें', with: 'साथ में', viewRecipe: 'रेसिपी देखें →', alsoPlanned: 'और भी',
    jumpToday: 'आज पर जाएँ', prevDay: 'पिछला दिन', nextDay: 'अगला दिन', prevWeek: 'पिछला हफ़्ता', nextWeek: 'अगला हफ़्ता',
    noMeal: '{meal} तय नहीं है', backToDay: 'दिन पर वापस', thisMeal: 'यह भोजन',
    perPerson: 'प्रति व्यक्ति', someEstimates: 'कुछ मान अनुमानित हैं', keepScreen: 'पकाते समय स्क्रीन चालू रखें',
    main: 'मुख्य', side: 'साथ में', min: 'मिनट', gProtein: 'ग्राम प्रोटीन',
    amountsWritten: 'मात्रा रेसिपी के अनुसार', amountsScaled: 'मात्रा {from} से {to} लोगों के लिए बदली गई',
    amountsNoServes: 'मात्रा रेसिपी के अनुसार (Notion में लोगों की संख्या नहीं)', noRecipe: 'अभी रेसिपी नहीं लिखी गई।',
    openNotion: 'Notion में खोलें', ingredients: 'सामग्री', method: 'विधि',
    mealsPlanned: 'तय भोजन', proteinWeek: 'इस हफ़्ते प्रोटीन', caloriesWeek: 'इस हफ़्ते कैलोरी', gProteinDay: '{n} ग्राम प्रोटीन',
    groceryList: 'किराने की सूची', next3: 'अगले 3 दिन', next7: 'अगले 7 दिन', nextWeekChip: 'अगला हफ़्ता',
    earlier: 'पहले', later: 'बाद में', meals: 'भोजन', items: 'चीज़ें', inBasket: 'टोकरी में',
    share: 'सूची भेजें', shareMeal: 'भोजन भेजें', shareWith: 'साथ में', shareNote: 'नोट', shareRecipe: 'रेसिपी के साथ भेजें', shareRecipeLine: 'रेसिपी', clear: 'निशान हटाएँ', copied: 'कॉपी हो गया!', noMealsDays: 'इन दिनों कोई भोजन तय नहीं है।',
    showUsedIn: 'किसमें लगेगा दिखाएँ', hideUsedIn: 'किसमें लगेगा छिपाएँ',
    inPantry: 'पहले से रसोई में है', inPantryShort: 'रसोई में', allInPantry: 'इन दिनों के लिए सब कुछ है।',
    inPantryHelp: 'Notion पैंट्री में In stock हैं, इसलिए सूची में नहीं हैं। किसी को Running low या Out of stock करें तो वह सूची में लौट आएगा।',
    pantryLow: 'कम है', pantryOut: 'ख़त्म', restock: 'फिर से लाएँ', haveQty: '{qty} है', editPantry: 'पैंट्री',
    amountsFor: 'मात्रा: {people}। जिन रेसिपी में Notion में लोगों की संख्या नहीं है, वे बिना मात्रा के दिखती हैं।',
    person: '{n} व्यक्ति', people: '{n} लोग', fewer: 'कम लोग', more: 'ज़्यादा लोग',
    synced: '{src} से {when} को अपडेट', notion: 'Notion', snapshot: 'सहेजी गई कॉपी', editNotion: 'Notion में बदलें',
    rDaily: 'रोज़', rWeekdays: 'हर कामकाजी दिन', rWeekends: 'हर वीकेंड', rWeekly: 'हर हफ़्ते', draft: 'Claude का सुझाव',
    tabPrep: 'तैयारी', prepEyebrow: 'पहले से तैयारी', prepTitle: 'भिगोना, अंकुरित करना, जमाना', prep2: 'अगले 2 दिन', prep4: 'अगले 4 दिन', prep7: 'अगले 7 दिन',
    prepTasks: 'काम', prepDoneCount: 'हो गए', prepNow: 'अभी करें', tonight: 'आज रात', thisMorning: 'आज सुबह', thisAfternoon: 'आज दोपहर',
    tomorrowMorning: 'कल सुबह', tomorrowAfternoon: 'कल दोपहर', tomorrowEvening: 'कल शाम',
    partMorning: 'सुबह', partAfternoon: 'दोपहर', partEvening: 'शाम',
    prepBy: '{time} तक', prepBefore: '{time} से पहले', prepFor: '{meal} के लिए · {dish}', prepNone: 'इन दिनों के लिए पहले से कुछ भिगोना या अंकुरित नहीं करना है।',
    prepSoak: '{what} भिगोएँ', prepSproutSoak: 'अंकुरित करने के लिए साबुत मूंग भिगोएँ ({what} के लिए)', prepSproutDrain: 'भीगे मूंग का पानी निकालें, धोएँ और गीले कपड़े में बाँध दें',
    prepHelp: 'रेसिपी से लिया गया: भिगोने वाली चीज़ें, अंकुरित दालें और घंटों लगने वाले काम। Notion में डिश के "Prep ahead" कॉलम में अपना लिखें, जैसे "Night before: Soak rajma"।',
    prepChip: '{n} तैयारी के काम', prepChipOne: '1 तैयारी का काम',
    tabToday: 'आज', tabHome: 'होम', tabShop: 'ख़रीदारी', tabWeek: 'हफ़्ता', tabSettings: 'सेटिंग्स',
    settings: 'सेटिंग्स', language: 'भाषा',
    languageHelp: 'Notion में अनुवाद होने पर रेसिपी इसी भाषा में दिखती हैं, नहीं तो अंग्रेज़ी में।',
    household: 'घर के लोग', householdHelp: 'रेसिपी की मात्रा और किराने की सूची इतने लोगों के लिए बनती है।',
    appearance: 'रूप', system: 'अपने-आप', light: 'हल्का', dark: 'गहरा',
    whatsapp: 'सुबह 6 बजे WhatsApp', whatsappHelp: 'हर सुबह 6 बजे, Notion की WhatsApp Recipients सूची के हर व्यक्ति को उसकी चुनी हुई भाषा में हर भोजन का एक संदेश मिलता है।',
    whatsappEdit: 'Notion में लोग बदलें',
    goalOf: '{goal} का {pct}%', dailyGoals: 'रोज़ के लक्ष्य', resetGoals: 'डिफ़ॉल्ट पर लौटाएँ',
    dailyGoalsHelp: 'प्रति व्यक्ति, प्रति दिन। प्रोटीन और फ़ाइबर पूरे करने के लक्ष्य हैं; कैलोरी, कार्ब्स और वसा की सीमा है।',
    proteinGoalLine: '{goal} ग्राम प्रोटीन लक्ष्य का {pct}%',
    dataTitle: 'आपका डेटा', lastSynced: 'पिछला अपडेट', couldntLoad: 'भोजन लोड नहीं हो सका', tryAgain: 'फिर कोशिश करें',
    'Vegetables & herbs': 'सब्ज़ियाँ और हरी पत्तियाँ', Fruit: 'फल', Dairy: 'डेयरी', 'Pulses, grains & flours': 'दालें, अनाज और आटा',
    'Nuts & seeds': 'मेवे और बीज', 'Spices & pantry': 'मसाले और राशन', Other: 'अन्य',
  },
  mr: {
    breakfast: 'नाश्ता', lunch: 'दुपारचे जेवण', dinner: 'रात्रीचे जेवण', snack: 'खाऊ',
    protein: 'प्रथिने', carbs: 'कर्बोदके', fat: 'स्निग्ध', fibre: 'तंतुमय', calories: 'कॅलरी',
    today: 'आज', tomorrow: 'उद्या', yesterday: 'काल',
    lateNight: 'शुभ रात्री', goodMorning: 'सुप्रभात', goodAfternoon: 'नमस्कार', goodEvening: 'शुभ संध्याकाळ',
    nextUp: 'पुढचे', letsEat: 'चला, छान जेवूया.',
    ledePlanned: 'आज 3 पैकी {n} जेवणे ठरली आहेत', ledeKcal: ', सुमारे {kcal} कॅलरी',
    ledeNext: 'आजसाठी काही ठरलेले नाही. पुढचे: {meal}, {day}.',
    ledeEmpty: 'अजून काही ठरलेले नाही. Notion मध्ये जेवण जोडा, ते इथे दिसेल.',
    todaysMeals: 'आजचे जेवण', thisWeek: 'हा आठवडा', weekOf: 'आठवडा',
    proteinToday: 'ग्रॅम प्रथिने आज', mealsPlannedToday: 'जेवणे आज ठरली',
    comingUp: 'पुढे · {day}', seeAll: 'सगळे पहा →', notPlanned: 'ठरलेले नाही', nothingPlanned: 'काही ठरलेले नाही',
    planInNotion: 'Notion मध्ये ठरवा', with: 'सोबत', viewRecipe: 'रेसिपी पहा →', alsoPlanned: 'आणखी',
    jumpToday: 'आजवर जा', prevDay: 'मागचा दिवस', nextDay: 'पुढचा दिवस', prevWeek: 'मागचा आठवडा', nextWeek: 'पुढचा आठवडा',
    noMeal: '{meal} ठरलेले नाही', backToDay: 'दिवसाकडे परत', thisMeal: 'हे जेवण',
    perPerson: 'प्रति व्यक्ती', someEstimates: 'काही आकडे अंदाजे आहेत', keepScreen: 'स्वयंपाक करताना स्क्रीन चालू ठेवा',
    main: 'मुख्य', side: 'सोबत', min: 'मिनिटे', gProtein: 'ग्रॅम प्रथिने',
    amountsWritten: 'प्रमाण रेसिपीप्रमाणे', amountsScaled: 'प्रमाण {from} ऐवजी {to} जणांसाठी',
    amountsNoServes: 'प्रमाण रेसिपीप्रमाणे (Notion मध्ये व्यक्तींची संख्या नाही)', noRecipe: 'अजून रेसिपी लिहिलेली नाही.',
    openNotion: 'Notion मध्ये उघडा', ingredients: 'साहित्य', method: 'कृती',
    mealsPlanned: 'ठरलेली जेवणे', proteinWeek: 'या आठवड्यात प्रथिने', caloriesWeek: 'या आठवड्यात कॅलरी', gProteinDay: '{n} ग्रॅम प्रथिने',
    groceryList: 'किराण्याची यादी', next3: 'पुढचे 3 दिवस', next7: 'पुढचे 7 दिवस', nextWeekChip: 'पुढचा आठवडा',
    earlier: 'आधी', later: 'नंतर', meals: 'जेवणे', items: 'वस्तू', inBasket: 'पिशवीत',
    share: 'यादी पाठवा', shareMeal: 'जेवण पाठवा', shareWith: 'सोबत', shareNote: 'टीप', shareRecipe: 'रेसिपीसह पाठवा', shareRecipeLine: 'रेसिपी', clear: 'खुणा काढा', copied: 'कॉपी झाले!', noMealsDays: 'या दिवसांत काही जेवण ठरलेले नाही.',
    showUsedIn: 'कशात लागेल ते दाखवा', hideUsedIn: 'कशात लागेल ते लपवा',
    inPantry: 'आधीच घरात आहे', inPantryShort: 'घरात', allInPantry: 'या दिवसांसाठी सगळं आहे.',
    inPantryHelp: 'Notion पॅन्ट्रीमध्ये In stock आहेत, म्हणून यादीत नाहीत. एखादी Running low किंवा Out of stock केली की ती यादीत परत येईल.',
    pantryLow: 'कमी आहे', pantryOut: 'संपले', restock: 'पुन्हा आणा', haveQty: '{qty} आहे', editPantry: 'पॅन्ट्री',
    amountsFor: 'प्रमाण: {people}. ज्या रेसिपीमध्ये Notion मध्ये व्यक्तींची संख्या नाही, त्या प्रमाणाशिवाय दिसतात.',
    person: '{n} व्यक्ती', people: '{n} जण', fewer: 'कमी जण', more: 'जास्त जण',
    synced: '{src} वरून {when} ला अद्ययावत', notion: 'Notion', snapshot: 'जतन केलेली प्रत', editNotion: 'Notion मध्ये बदला',
    rDaily: 'रोज', rWeekdays: 'दर कामाच्या दिवशी', rWeekends: 'दर शनिवार-रविवार', rWeekly: 'दर आठवड्याला', draft: 'Claude ची सूचना',
    tabPrep: 'तयारी', prepEyebrow: 'आधीची तयारी', prepTitle: 'भिजवणे, मोड आणणे, विरजणे', prep2: 'पुढचे 2 दिवस', prep4: 'पुढचे 4 दिवस', prep7: 'पुढचे 7 दिवस',
    prepTasks: 'कामे', prepDoneCount: 'झाली', prepNow: 'आत्ता करा', tonight: 'आज रात्री', thisMorning: 'आज सकाळी', thisAfternoon: 'आज दुपारी',
    tomorrowMorning: 'उद्या सकाळी', tomorrowAfternoon: 'उद्या दुपारी', tomorrowEvening: 'उद्या संध्याकाळी',
    partMorning: 'सकाळ', partAfternoon: 'दुपार', partEvening: 'संध्याकाळ',
    prepBy: '{time} पर्यंत', prepBefore: '{time} च्या आधी', prepFor: '{meal} साठी · {dish}', prepNone: 'या दिवसांसाठी आधी काही भिजवायचे किंवा मोड आणायचे नाही.',
    prepSoak: '{what} भिजत घाला', prepSproutSoak: 'मोड आणण्यासाठी अख्खे मूग भिजत घाला ({what} साठी)', prepSproutDrain: 'भिजलेले मूग निथळा, धुवा आणि ओल्या कपड्यात बांधा',
    prepHelp: 'रेसिपीतून घेतले: भिजवायचे पदार्थ, मोड आणि तासन्तास लागणारी कामे. Notion मध्ये डिशच्या "Prep ahead" कॉलममध्ये स्वतः लिहा, उदा. "Night before: Soak rajma".',
    prepChip: '{n} तयारीची कामे', prepChipOne: '1 तयारीचे काम',
    tabToday: 'आज', tabHome: 'मुख्यपान', tabShop: 'खरेदी', tabWeek: 'आठवडा', tabSettings: 'सेटिंग्ज',
    settings: 'सेटिंग्ज', language: 'भाषा',
    languageHelp: 'Notion मध्ये भाषांतर असल्यास रेसिपी याच भाषेत दिसतात, नाहीतर इंग्रजीत.',
    household: 'घरातील व्यक्ती', householdHelp: 'रेसिपीचे प्रमाण आणि किराण्याची यादी इतक्या जणांसाठी मोजली जाते.',
    appearance: 'रंगरूप', system: 'आपोआप', light: 'फिकट', dark: 'गडद',
    whatsapp: 'सकाळी 6 वाजता WhatsApp', whatsappHelp: 'दररोज सकाळी 6 वाजता, Notion मधील WhatsApp Recipients यादीतील प्रत्येकाला त्यांनी निवडलेल्या भाषेत प्रत्येक जेवणाचा एक संदेश येतो.',
    whatsappEdit: 'Notion मध्ये व्यक्ती बदला',
    goalOf: '{goal} पैकी {pct}%', dailyGoals: 'दैनिक लक्ष्य', resetGoals: 'मूळ मूल्ये वापरा',
    dailyGoalsHelp: 'प्रति व्यक्ती, प्रति दिवस. प्रथिने आणि तंतुमय हे गाठायचे लक्ष्य आहेत; कॅलरी, कर्बोदके आणि स्निग्ध यांची मर्यादा आहे.',
    proteinGoalLine: '{goal} ग्रॅम प्रथिने लक्ष्याच्या {pct}%',
    dataTitle: 'तुमचा डेटा', lastSynced: 'शेवटचे अद्ययावत', couldntLoad: 'जेवण लोड होऊ शकले नाही', tryAgain: 'पुन्हा प्रयत्न करा',
    'Vegetables & herbs': 'भाज्या आणि हिरव्या पालेभाज्या', Fruit: 'फळे', Dairy: 'दुग्धजन्य', 'Pulses, grains & flours': 'डाळी, धान्य आणि पीठ',
    'Nuts & seeds': 'सुका मेवा आणि बिया', 'Spices & pantry': 'मसाले आणि किराणा', Other: 'इतर',
  },
};

const TAGS = {
  'High protein': { hi: 'हाई प्रोटीन', mr: 'भरपूर प्रथिने' },
  Vegetarian: { hi: 'शाकाहारी', mr: 'शाकाहारी' },
  'Make ahead': { hi: 'पहले से बना सकते हैं', mr: 'आधी करून ठेवता येते' },
  'Office-friendly': { hi: 'ऑफ़िस के लिए', mr: 'ऑफिससाठी' },
};

const UNITS = {
  g: { hi: 'ग्राम', mr: 'ग्रॅम' }, kg: { hi: 'किलो', mr: 'किलो' }, ml: { hi: 'मिली', mr: 'मिली' }, l: { hi: 'लीटर', mr: 'लिटर' },
  cup: { hi: 'कप', mr: 'कप' }, tsp: { hi: 'छोटा चम्मच', mr: 'लहान चमचा' }, tbsp: { hi: 'बड़ा चम्मच', mr: 'मोठा चमचा' },
  inch: { hi: 'इंच', mr: 'इंच' }, kcal: { hi: 'कैलोरी', mr: 'कॅलरी' },
};

// Grocery item names as produced by kitchen.js.
const GROCERIES = {
  bhindi: ['भिंडी', 'भेंडी'], capsicum: ['शिमला मिर्च', 'ढोबळी मिरची'], coconut: ['नारियल', 'नारळ'], coriander: ['हरा धनिया', 'कोथिंबीर'],
  cucumber: ['खीरा', 'काकडी'], 'curry leaves': ['करी पत्ते', 'कढीपत्ता'], ginger: ['अदरक', 'आले'], 'ginger-garlic paste': ['अदरक-लहसुन पेस्ट', 'आले-लसूण पेस्ट'],
  'green chilli': ['हरी मिर्च', 'हिरवी मिरची'], lemon: ['नींबू', 'लिंबू'], mint: ['पुदीना', 'पुदिना'], 'mixed vegetable': ['मिली-जुली सब्ज़ियाँ', 'मिश्र भाज्या'],
  'moong sprouts': ['अंकुरित मूंग', 'मोड आलेले मूग'], onion: ['प्याज़', 'कांदा'], potato: ['आलू', 'बटाटा'], spinach: ['पालक', 'पालक'], tomato: ['टमाटर', 'टोमॅटो'],
  banana: ['केला', 'केळे'], curd: ['दही', 'दही'], ghee: ['घी', 'तूप'], 'hung curd': ['टंगा हुआ दही', 'चक्का'], paneer: ['पनीर', 'पनीर'],
  'bajra flour': ['बाजरे का आटा', 'बाजरीचे पीठ'], besan: ['बेसन', 'बेसन'], chana: ['चना', 'चणे'], 'chana dal': ['चना दाल', 'चणा डाळ'], chhole: ['छोले', 'छोले'],
  chickpeas: ['छोले', 'छोले'], 'idli rice': ['इडली चावल', 'इडली तांदूळ'], 'jowar flour': ['ज्वार का आटा', 'ज्वारीचे पीठ'],
  'multigrain flour blend': ['मल्टीग्रेन आटा मिश्रण', 'मल्टीग्रेन पीठ मिश्रण'], 'multigrain roti': ['मल्टीग्रेन रोटी', 'मल्टीग्रेन पोळी'],
  'oats flour': ['ओट्स का आटा', 'ओट्सचे पीठ'], poha: ['पोहा', 'पोहे'], 'ragi flour': ['रागी का आटा', 'नाचणीचे पीठ'], rajma: ['राजमा', 'राजमा'],
  'soya flour': ['सोया आटा', 'सोया पीठ'], 'soya granule': ['सोया ग्रैन्यूल्स', 'सोया ग्रॅन्युल्स'], 'split yellow moong dal': ['पीली मूंग दाल', 'पिवळी मूग डाळ'],
  'toor dal': ['तूर दाल', 'तूर डाळ'], 'whole urad dal': ['साबुत उड़द दाल', 'अख्खी उडीद डाळ'], 'whole wheat atta': ['गेहूँ का आटा', 'गव्हाचे पीठ'],
  almond: ['बादाम', 'बदाम'], 'almonds and walnut': ['बादाम और अखरोट', 'बदाम आणि अक्रोड'], 'chia seeds': ['चिया बीज', 'चिया बिया'], makhana: ['मखाना', 'मखाणा'],
  peanut: ['मूँगफली', 'शेंगदाणे'], walnut: ['अखरोट', 'अक्रोड'], ajwain: ['अजवाइन', 'ओवा'], amchur: ['अमचूर', 'आमचूर'], 'bay leaf': ['तेज पत्ता', 'तमालपत्र'],
  'black pepper': ['काली मिर्च', 'मिरी'], 'black salt': ['काला नमक', 'काळे मीठ'], 'chaat masala': ['चाट मसाला', 'चाट मसाला'],
  'chana masala powder': ['छोले मसाला', 'छोले मसाला'], cinnamon: ['दालचीनी', 'दालचिनी'], 'coriander powder': ['धनिया पाउडर', 'धणे पूड'],
  'cumin powder': ['जीरा पाउडर', 'जिरे पूड'], 'cumin seeds': ['जीरा', 'जिरे'], 'dry red chilli': ['सूखी लाल मिर्च', 'सुकी लाल मिरची'],
  'garam masala': ['गरम मसाला', 'गरम मसाला'], hing: ['हींग', 'हिंग'], honey: ['शहद', 'मध'], jaggery: ['गुड़', 'गूळ'],
  'kashmiri chilli powder': ['कश्मीरी मिर्च पाउडर', 'काश्मिरी तिखट'], 'kasuri methi': ['कसूरी मेथी', 'कसुरी मेथी'], 'methi seeds': ['मेथी दाना', 'मेथी दाणे'],
  'mustard seeds': ['राई', 'मोहरी'], oil: ['तेल', 'तेल'], 'olive oil': ['ऑलिव ऑयल', 'ऑलिव्ह ऑइल'], 'red chilli powder': ['लाल मिर्च पाउडर', 'लाल तिखट'],
  apple: ['सेब', 'सफरचंद'], guava: ['अमरूद', 'पेरू'], papaya: ['पपीता', 'पपई'], pomegranate: ['अनार', 'डाळिंब'],
  'pomegranate seeds': ['अनार के दाने', 'डाळिंबाचे दाणे'], orange: ['संतरा', 'संत्री'], pineapple: ['अनानास', 'अननस'], mosambi: ['मौसंबी', 'मोसंबी'],
  salt: ['नमक', 'मीठ'], 'sambar powder': ['सांबर मसाला', 'सांबार मसाला'], turmeric: ['हल्दी', 'हळद'], tamarind: ['इमली', 'चिंच'],
};

const LANG_KEY = 'lang';
let lang = (() => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch { /* storage unavailable */ }
  const nav = (navigator.language || 'en').slice(0, 2);
  return LANGS[nav] ? nav : 'en';
})();

export const getLang = () => lang;
export function setLang(next) {
  if (!LANGS[next]) return;
  lang = next;
  try { localStorage.setItem(LANG_KEY, next); } catch { /* storage unavailable */ }
}
export const locale = () => LANGS[lang].locale;

export function t(key, vars = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export const tag = (name) => TAGS[name]?.[lang] ?? name;
export const unit = (u) => (lang === 'en' ? u : UNITS[u]?.[lang] ?? u);
export const grocery = (name) => (lang === 'en' ? name : GROCERIES[name]?.[lang === 'hi' ? 0 : 1] ?? name);

// Translates the unit words in an amount like "375 g + 1 cup".
export const amount = (text) => (lang === 'en' ? text : text.replace(/\b(kg|ml|g|l|cup|tsp|tbsp|inch)\b/g, (u) => unit(u)));

// A dish's text in the current language, falling back to English field by field.
export function dishText(dish, field) {
  const v = dish?.i18n?.[lang]?.[field];
  return v != null && (!Array.isArray(v) || v.length) && v !== '' ? v : dish?.[field];
}
