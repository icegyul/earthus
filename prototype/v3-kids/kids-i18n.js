/* EARTHUS KIDS (v3) — 영어
 *
 * v3 는 한 파일로 자란 한국어 앱이다. 문구가 마크업·자바스크립트·템플릿에 흩어져 있어
 * 호출부 200곳을 고치는 대신 **치환 층**을 얹는다. 한국어가 원본이고 영어는 그 위에 덮는다.
 *
 *   1) 사전에 있는 문구를 화면에서 찾아 바꾼다 (글자 마디와 title/aria-label)
 *   2) 나중에 만들어지는 것도 바꾸도록 MutationObserver 로 지켜본다
 *   3) 템플릿(`${도시} 구름이 많아요` 같은 것)은 index.html 에서 직접 고친다 —
 *      치환 층으로는 못 잡는다. 반만 잡고 됐다고 하면 그게 더 나쁘다.
 *
 * ⚠️ 사전에 없는 문구는 **한국어 그대로 남는다.** 그건 버그가 아니라 아직 안 옮긴 것이다.
 *    window.KIDS_I18N.missing() 을 부르면 화면에 남은 한국어를 돌려준다 — 그걸로 채운다.
 *
 * 언어는 v1·v2 와 같은 규칙: 저장값이 있으면 그것, 없으면 기기 언어. 한국어가 기본.
 */
(function () {
  'use strict';
  if (window.KIDS_I18N) return;

  var LS = 'earthus.lang';
  function pick() {
    try {
      var v = localStorage.getItem(LS) || localStorage.getItem('earthus.v2.lang');
      if (v === 'ko' || v === 'en') return v;
    } catch (e) { /* 사생활 모드 */ }
    var n = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^ko/i.test(n) ? 'ko' : 'en';
  }

  var EN = {
    // ── 화면 뼈대 ──
    '지구야, 오늘 어때?': 'Hey Earth, how are you today?',
    '지구를 돌려서 지금 날씨를 만나 보세요': 'Spin the Earth and meet the weather right now',
    '손가락으로 지구를 돌려 보세요': 'Spin the Earth with your finger',
    '불러오는 중': 'Loading',
    '만나기': 'Meet',
    '읽기': 'Read',
    '오늘': 'Today',
    '지구': 'Earth',
    '실험': 'Try it',
    '내 책': 'My book',
    '우리 집': 'Home',
    '내 위치': 'Where I am',
    '지금': 'Now',
    '예보': 'Forecast',
    '실황': 'Live',
    '5°격자': '5° grid',
    '어린이 전용': 'For kids only',
    '아이용 — 하나씩 만나기': 'For kids — meet them one at a time',
    '어른용 — 한눈에 읽기': 'For grown-ups — read at a glance',
    '화면 고르기': 'Choose a view',
    '우리 집으로 돌아가기': 'Go back home',
    '내 위치 날씨 보기': 'See the weather where I am',
    '시간 되감기 — 오른쪽으로 갈수록 먼 옛날': 'Rewind time — the further right, the longer ago',
    '한반도를 손으로 되감아 보세요': 'Rewind Korea with your finger',
    '▶ 인도가 아시아에 부딪히는 걸 보기': '▶ Watch India crash into Asia',
    '2억 5천만 년 전': '250 million years ago',
    '닫기': 'Close',
    '이게 뭐야?': "What's this?",
    '이게 뭐야': "What's this?",
    '로그인': 'Sign in',
    '로그인 / 계정': 'Sign in / account',
    '왼쪽 단추가 뭘 보여주는지 알려줄게': "I'll tell you what the buttons on the left show",

    // ── 왼쪽 단추 ──
    '구름': 'Clouds', '구름 보기': 'Show clouds',
    '비': 'Rain', '비 보기': 'Show rain',
    '번개': 'Lightning', '번개 보기': 'Show lightning',
    '공룡 발자국': 'Dinosaur tracks', '공룡 발자국 보기': 'Show dinosaur tracks',
    '낮과 밤': 'Day and night', '낮과 밤 보기': 'Show day and night',
    '기온': 'Temperature', '기온 보기': 'Show temperature',
    '바람': 'Wind', '바람 보기': 'Show wind',
    '강·댐': 'Rivers & dams', '강과 댐 보기': 'Show rivers and dams',
    '충돌구': 'Impact craters', '운석 충돌구 보기': 'Show meteorite craters',
    '지진·판 경계': 'Quakes & plates', '지진과 판 경계 보기': 'Show earthquakes and plate edges',
    '산맥': 'Mountains', '산맥 보기': 'Show mountain ranges',
    '옛 대륙': 'Ancient continents', '옛 대륙 보기': 'Show the ancient continents',
    '날씨': 'Weather',
    '전지구 구름': 'Global clouds',

    // ── 지구가 하는 말 ──
    // 형용사 한 낱말로 둔다. 도시 이름 뒤에 붙는 자리라 문장을 넣으면 겹친다
    // ('Seoul it's cloudy'). 붙이는 방식은 index.html 이 정한다.
    '맑아요': 'sunny',
    '구름이 많아요': 'cloudy',
    '비가 와요': 'rainy',
    '눈이 내려요': 'snowy',
    '번개가 쳐요': 'stormy',

    // ── "이게 뭐야" 설명 ──
    '지금 하늘에 있는 진짜 구름이야. 인공위성이 찍은 거란다.':
      'These are the real clouds in the sky right now. A satellite took the picture.',
    '지금 비가 오는 곳이야. 파랄수록 조금, 노랗고 빨가면 많이 와.':
      "Where it's raining now. Bluer means a little, yellow and red mean a lot.",
    '천둥번개가 치는 곳이야.': 'Where thunder and lightning are happening.',
    '해가 비치는 쪽이 낮, 반대쪽이 밤이야. 지금 이 순간 그대로란다.':
      'The sunny side is day, the other side is night — exactly as it is right now.',
    '어디가 덥고 어디가 추운지 색으로 보여줘.': 'Colours show where it is hot and where it is cold.',
    '바람이 어느 쪽으로 부는지 보여줘.': 'Shows which way the wind is blowing.',
    '큰 강과 댐이 어디 있는지 보여줘.': 'Shows where the big rivers and dams are.',
    '땅에서 가장 높이 솟은 곳들이야.': 'The highest places on land.',
    '땅이 흔들린 곳과, 땅덩어리가 만나는 금이야.':
      'Where the ground shook, and the seams where the big plates meet.',
    '아주 옛날에 운석이 떨어져 파인 자국이야.':
      'Dents left long ago where meteorites fell.',
    '공룡 화석이 나온 곳이야.': 'Places where dinosaur fossils were found.',
    '아주 먼 옛날에는 대륙이 하나로 붙어 있었어. 그때 모습이야.':
      'Long, long ago all the land was joined together. This is what it looked like.',
    '네가 있는 곳으로 지구를 돌려줘.': 'Turns the Earth to where you are.',

    // ── 인도-아시아 충돌 이야기 ──
    '1억 년 전. 인도는 아직 남쪽 바다에 떠 있는 섬이에요.':
      '100 million years ago. India is still an island in the southern sea.',
    '인도가 북쪽으로 올라오기 시작해요.': 'India starts moving north.',
    '아직 아시아와 멀리 떨어져 있어요.': "It's still far from Asia.",
    '점점 빨라져요. 곧 부딪혀요.': "It speeds up. It's about to crash.",
    '부딪혔어요! 갈 곳이 없어진 땅이 위로 솟아요.':
      'Crash! The land has nowhere to go, so it pushes upward.',
    '솟아오른 것이 히말라야예요. 지금도 조금씩 높아지고 있어요.':
      'What rose up is the Himalayas. It is still growing a little every year.',
    '지금이에요. 저 산맥이 그때 부딪혀 생긴 거예요.':
      'This is now. Those mountains came from that crash.',
    '땅이 부딪히는 장면': 'the moment the land crashes',
    '공룡은 어디에 있었을까?': 'Where were the dinosaurs?',
    '우리나라 공룡 발자국 여덟 곳': 'Eight dinosaur track sites in Korea',
    '4000만 년 전': '40 million years ago',
    '5000만 년 전': '50 million years ago',

    // ── 옛 대륙 ──
    '판노티아': 'Pannotia', '곤드와나': 'Gondwana', '판게아': 'Pangaea',
    '판게아가 갈라진다': 'Pangaea breaks apart',
    '지금 모양으로': 'Into the shape we know',
    '지금 이 순간': 'This very moment',
    '있었는지 자체가 아직 논쟁 중인 초대륙':
      'A supercontinent scientists still argue about — it may not have existed',
    '남쪽 대륙들이 이미 하나로 모여 있던 때': 'When the southern lands were already one',
    '모든 땅이 하나 — 북쪽은 로라시아, 남쪽은 곤드와나':
      'All land in one — Laurasia in the north, Gondwana in the south',
    '로라시아와 곤드와나로 나뉘는 중': 'Splitting into Laurasia and Gondwana',
    '대륙이 오늘 자리를 찾아간다': 'The continents move to where they are today',
    '이 시대에 있는 판인가': 'Did this plate exist back then',
    '여기가 땅이었다': 'This was land',
    '바다 밑 자기 줄무늬로 위치가 잘 묶이는 구간':
      'A stretch where seafloor magnetic stripes pin the position well',
    '위치가 대체로 잘 맞는 구간': 'A stretch where the position matches fairly well',
    '이 시대는 동서 위치가 덜 확실합니다':
      'For this era the east–west position is less certain',
    '어디로 갈지': 'where it is heading',

    // ── 땅 이름 ──
    '북아메리카': 'North America', '남아메리카': 'South America',
    '유라시아': 'Eurasia', '유럽': 'Europe', '시베리아': 'Siberia',
    '한반도': 'Korea', '아프리카': 'Africa', '서아프리카': 'West Africa',
    '오스트레일리아': 'Australia',

    // ── 나라 ──
    '중국': 'China', '러시아': 'Russia', '미국': 'United States', '영국': 'United Kingdom',
    '한국': 'South Korea', '북한': 'North Korea', '일본': 'Japan', '인도': 'India',
    '브라질': 'Brazil', '호주': 'Australia', '뉴질랜드': 'New Zealand', '독일': 'Germany',
    '프랑스': 'France', '스페인': 'Spain', '이탈리아': 'Italy', '네덜란드': 'Netherlands',
    '이집트': 'Egypt', '남아공': 'South Africa', '사우디': 'Saudi Arabia',
    '아랍에미리트': 'UAE', '멕시코': 'Mexico', '캐나다': 'Canada',
    '아르헨티나': 'Argentina', '칠레': 'Chile', '페루': 'Peru', '콜롬비아': 'Colombia',
    '튀르키예': 'Türkiye', '이란': 'Iran', '이라크': 'Iraq', '우크라이나': 'Ukraine',
    '폴란드': 'Poland', '스웨덴': 'Sweden', '노르웨이': 'Norway',
    '카자흐스탄': 'Kazakhstan', '몽골': 'Mongolia', '대만': 'Taiwan',
    '필리핀': 'Philippines', '베트남': 'Vietnam', '태국': 'Thailand',
    '인도네시아': 'Indonesia', '말레이시아': 'Malaysia', '파키스탄': 'Pakistan',
    '나이지리아': 'Nigeria', '에티오피아': 'Ethiopia', '케냐': 'Kenya',
    '알제리': 'Algeria', '모로코': 'Morocco', '콩고': 'Congo', '탄자니아': 'Tanzania',
    '수단': 'Sudan', '그린란드': 'Greenland', '러시아·일본': 'Russia · Japan',

    // ── 도시 ──
    '서울': 'Seoul', '도쿄': 'Tokyo', '베이징': 'Beijing', '마닐라': 'Manila',
    '시드니': 'Sydney', '뭄바이': 'Mumbai', '카이로': 'Cairo', '런던': 'London',
    '모스크바': 'Moscow', '뉴욕': 'New York', '리마': 'Lima', '상파울루': 'São Paulo',
    '케이프타운': 'Cape Town', '앵커리지': 'Anchorage', '롱이어비엔': 'Longyearbyen',


    // ── 강 (Natural Earth 1:50m) ──
    '갠지스강': 'Ganges', '나일강': 'Nile', '네그루강': 'Rio Negro', '니제르강': 'Niger',
    '다뉴브강': 'Danube', '달링강': 'Darling', '레나강': 'Lena', '마데이라강': 'Madeira',
    '매켄지강': 'Mackenzie', '머리강': 'Murray', '메콩강': 'Mekong', '미시시피강': 'Mississippi',
    '미주리강': 'Missouri', '백나일강': 'White Nile', '볼가강': 'Volga',
    '브라마푸트라강': 'Brahmaputra', '세인트로렌스강': 'St. Lawrence', '셀렝가강': 'Selenga',
    '슬레이브강': 'Slave', '아마존강': 'Amazon', '아무르강': 'Amur', '앙가라강': 'Angara',
    '예니세이강': 'Yenisei', '오리노코강': 'Orinoco', '오비강': 'Ob', '오하이오강': 'Ohio',
    '우방기강': 'Ubangi', '우카얄리강': 'Ucayali', '유콘강': 'Yukon', '유프라테스강': 'Euphrates',
    '이라와디강': 'Irrawaddy', '이르티시강': 'Irtysh', '인더스강': 'Indus', '잠베지강': 'Zambezi',
    '창장(양쯔강)': 'Yangtze', '청나일강': 'Blue Nile', '카사이강': 'Kasai', '컬럼비아강': 'Columbia',
    '콩고강': 'Congo', '파라나강': 'Paraná', '피스강': 'Peace', '황허': 'Yellow River',
    '금강': 'Geum', '낙동강': 'Nakdong', '남한강': 'South Han', '북한강': 'North Han',
    '볼타강': 'Volta', '수틀레지강': 'Sutlej', '카로니강': 'Caroní',
    '콜로라도강': 'Colorado', '페더강': 'Feather',

    // ── 댐 ──
    '싼샤(三峡)댐': 'Three Gorges Dam', '이타이푸댐': 'Itaipu Dam', '후버댐': 'Hoover Dam',
    '아스완 하이댐': 'Aswan High Dam', '과리댐': 'Guri Dam', '타르벨라댐': 'Tarbela Dam',
    '브라츠크댐': 'Bratsk Dam', '아코소마보댐': 'Akosombo Dam', '바크라댐': 'Bhakra Dam',
    '소양강댐': 'Soyanggang Dam', '충주댐': 'Chungju Dam', '대청댐': 'Daecheong Dam',
    '안동댐': 'Andong Dam', // ⚠️ '로부지댐' 은 이름만 다른 댐 것이고 좌표·나라(짐바브웨·잠비아)·설명은 카리바댐이다.
    '로부지댐': 'Kariba Dam',
    '그랜드에티오피아 르네상스댐': 'Grand Ethiopian Renaissance Dam',
    // ⚠️ 아래 세 이름은 한국어 원본이 잘못돼 있다(편집 흔적·오기). 영어는 실제 이름으로 적는다.
    //    한국어 쪽은 data/water.json 을 고쳐야 한다 — 여기서 덮으면 틀린 원본이 남는다.
    '후버 다음 글렌캐니언댐': 'Glen Canyon Dam',
    '후버 근처 오로빌댐': 'Oroville Dam',
    '구로지구 사얀댐': 'Sayano-Shushenskaya Dam',

    // ── 우리나라 공룡 화석지 ──
    '해남': 'Haenam', '진주 정촌': 'Jinju Jeongchon', '여수': 'Yeosu', '고성': 'Goseong',
    '화순': 'Hwasun', '진주 유수': 'Jinju Yusu', '남해': 'Namhae', '의성': 'Uiseong',


    // ── 충돌구 설명 (craters.json 의 kid) ──
    '지구에서 가장 크고 가장 오래된 충돌 자국이에요.':
      'The biggest and oldest impact scar on Earth.',
    '큰 공룡이 사라진 그때 떨어진 자리예요. 지금은 바다와 땅에 반쯤 묻혀 있어요.':
      'This is where the rock fell when the big dinosaurs disappeared. Half of it is under the sea now.',
    '너무 오래돼서 땅이 눌리고 휘어졌어요.': 'It is so old that the ground has been squashed and bent.',
    '부딪힌 힘으로 땅속 탄소가 다이아몬드가 됐어요.':
      'The crash was so hard that carbon underground turned into diamonds.',
    '공룡이 나오기도 훨씬 전 일이에요.': 'This happened long before dinosaurs existed.',
    '지금은 동그란 호수가 되어 우주에서도 잘 보여요.':
      'Today it is a ring-shaped lake you can see from space.',
    '바다 밑에 숨어 있어서 한참 뒤에야 찾았어요.':
      'It was hiding under the sea, so nobody found it for a long time.',
    '모래 아래 깊이 묻혀 있어요.': 'It is buried deep under the sand.',
    '마을이 충돌구 안에 들어앉아 있어요.': 'A whole town sits inside the crater.',
    '해발 4,000m 가 넘는 높은 곳에 있어요.': 'It sits more than 4,000 m above sea level.',
    '충돌구 한가운데에 도시가 있어요.': 'There is a city right in the middle of the crater.',
    '가장 또렷하게 남은 충돌구예요. 걸어서 가장자리를 돌 수 있어요.':
      'The clearest crater left on Earth. You can walk all the way around its rim.',
    '사막 한가운데에 동그랗게 파여 있어요.': 'A round hole scooped out in the middle of the desert.',

    // ── 댐 설명 (water.json 의 why) ──
    '세계 최대 발전량': 'Most electricity of any dam in the world',
    '한때 세계 최대': 'Once the largest in the world',
    '미국을 상징하는 댐': 'The dam that symbolises the United States',
    '나일강을 멈춰 세운 댐': 'The dam that stopped the Nile',
    '흙으로 쌓은 것 중 손꼽히는 크기': 'One of the largest dams built from earth',
    '사람이 만든 가장 넓은 호수': 'The widest lake people have ever made',
    '국내 최대 사력댐': "Korea's largest rock-fill dam",
    '국내 최대 콘크리트댐': "Korea's largest concrete dam",
    '카리바 댐': 'Kariba Dam',
    '아프리카 최대 발전 댐': "Africa's biggest power dam",
    '미국에서 가장 높은 댐': 'The tallest dam in the United States',
    '전 세계 댐은 4만 개가 넘지만 전지구 화면에서는 뜻이 없어 손으로 고른 큰 것만 싣는다.':
      'There are over 40,000 dams worldwide; only large hand-picked ones are shown here.',

    // ── 우리나라 공룡 화석지 (korea-fossils.json) ──
    '해남 우항리 공룡·익룡·새발자국 화석산지':
      'Uhang-ri Dinosaur, Pterosaur and Bird Track Site, Haenam',
    '진주 정촌면 백악기 공룡·익룡발자국 화석산지':
      'Cretaceous Dinosaur and Pterosaur Track Site, Jeongchon, Jinju',
    '여수 낭도리 공룡발자국 화석산지 및 퇴적층':
      'Nangdo-ri Dinosaur Track Site and Sedimentary Beds, Yeosu',
    '고성 덕명리 공룡과 새발자국 화석산지':
      'Deokmyeong-ri Dinosaur and Bird Track Site, Goseong',
    '화순 서유리 공룡발자국 화석산지': 'Seoyu-ri Dinosaur Track Site, Hwasun',
    '진주 유수리 백악기 하성퇴적층': 'Yusu-ri Cretaceous River Beds, Jinju',
    '남해 가인리 화석산지': 'Gain-ri Fossil Site, Namhae',
    '의성 제오리 공룡발자국 화석산지': 'Jeo-ri Dinosaur Track Site, Uiseong',

    '옛날 옛적에 공룡이랑 하늘을 나는 익룡이랑 새가 같은 땅을 밟고 지나갔어요.':
      'Long ago, dinosaurs, flying pterosaurs and birds all walked across this same ground.',
    '발자국이 만 개나 있어요. 하루 종일 세어도 다 못 세요.':
      'There are ten thousand footprints here. You could count all day and not finish.',
    '공룡 한 마리가 걸어간 길이 84걸음도 넘게 이어져 있어요.':
      'One dinosaur left a trail of more than 84 steps in a row.',
    '바닷가 바위에 공룡 발자국이 쭉 이어져 있어요. 직접 밟아 볼 수 있어요.':
      'Dinosaur footprints run along the seaside rocks. You can step on them yourself.',
    '여기는 고기를 먹는 공룡이 자주 지나다녔어요.': 'Meat-eating dinosaurs came this way often.',
    '여기서는 발자국 말고 진짜 공룡 뼈가 나왔어요.':
      'Here they found real dinosaur bones, not just footprints.',
    '여기도 고기 먹는 공룡이 줄지어 걸어갔어요.':
      'Meat-eating dinosaurs walked here in a line too.',
    '우리나라에서 공룡 발자국을 제일 먼저 보물로 정한 곳이에요.':
      'The first place in Korea where dinosaur footprints were made a national treasure.',

    '공룡·익룡·새 발자국이 한 지층에서 함께 나온 곳':
      'Dinosaur, pterosaur and bird tracks found together in one rock layer',
    '한 곳에서 나온 발자국 수가 가장 많은 산지': 'The site with the most footprints found in one place',
    '한 마리가 걸어간 자국이 가장 길게 남은 곳': 'The longest single trackway left by one animal',
    '바닷가 바위를 따라 발자국이 끝없이 이어지는 곳':
      'Footprints running on and on along the seaside rocks',
    '고기 먹는 공룡이 멀리 걸어간 자국이 몰려 있는 곳':
      'Where long trackways of meat-eating dinosaurs are clustered',
    '발자국이 아니라 뼈가 가장 많이 나온 곳': 'Where bones, not footprints, were found most',
    '고기 먹는 공룡의 보행렬이 집중된 곳': 'Where trackways of meat-eating dinosaurs are concentrated',
    '공룡 화석지로는 우리나라에서 가장 먼저 천연기념물이 된 곳':
      'The first dinosaur fossil site in Korea to become a Natural Monument',

    '공룡 발자국 823': '823 dinosaur tracks',
    '익룡 발자국 443': '443 pterosaur tracks',
    '새 발자국': 'bird tracks',
    '공룡 뼈': 'dinosaur bones',
    '공룡·익룡 발자국 약 1만 점': 'about 10,000 dinosaur and pterosaur tracks',
    '발자국 3,546점': '3,546 tracks',
    '조각류가 81%': '81% ornithopods',
    '해안 41km에 발자국 1,900족 이상': 'over 1,900 tracks along 41 km of coast',
    '발자국 1,800여 개': 'about 1,800 tracks',
    '보행렬 70여 개': 'about 70 trackways',
    '공룡 뼈 100여 점': 'about 100 dinosaur bones',
    '나무 그루터기': 'tree stumps',
    '발자국 1,500여 점': 'about 1,500 tracks',
    '발자국 384개': '384 tracks',
    '보행렬 35개': '35 trackways',

    // ── 출처·한계를 말하는 문장 (아이 화면에서도 숨기지 않는다) ──
    '지름과 나이는 자료마다 다릅니다': 'Diameter and age differ between sources',
    '손으로 정리한 목록입니다.': 'This list was put together by hand.',
    '강을 막아 물을 모으고 전기를 만듭니다.':
      'A dam holds back a river to store water and make electricity.',
    '좌표는 위키데이터·위키백과에서 확인한 값입니다.':
      'Coordinates checked against Wikidata and Wikipedia.',
    '좌표가 지정구역 중심이 아닐 수 있음':
      'The point may not be the centre of the protected area',
    '국가유산청 지정 좌표': 'Coordinates designated by the Korea Heritage Service',
    '판 경계': 'plate boundaries',
    '판 경계 Bird(2003) PB2002 · ODC-BY': 'Plate boundaries — Bird (2003) PB2002 · ODC-BY',
    '점 하나가 지진 한 번이에요. 하루만 보면 흩어져 있는데, 25년을 쌓으면 줄이 보여요.':
      'Each dot is one earthquake. In a single day they look scattered; stack 25 years and lines appear.',
    '그 줄이': 'Those lines are the',
    '예요. 하늘색 선은 지질학자가 그린 판 경계고, 붉은 점이 그 위에 겹칩니다.':
      '. The pale blue lines are plate boundaries drawn by geologists, and the red dots sit on top of them.',
    '약 50만': 'about 500,000', '약 5만': 'about 50,000',
    '초당 각도': 'degrees per second',

    // ── 안 될 때 하는 말 (없는 값을 지어내지 않는다) ──
    '위치를 못 받았어요': "I couldn't get your location",
    // 마크업에서 줄이 끊겨 있다. 공백을 누른 형태로 적어 둔다 (t() 가 눌러서 찾는다).
    '브라우저가 위치를 알려주지 않았습니다. 주소창 옆에서 위치 허용을 켜면 다시 시도할 수 있어요.':
      'The browser did not share your location. Turn location on next to the address bar and try again.',
    '받은 좌표는 날씨를 부르는 데만 쓰고 저장하지 않습니다.':
      'Your coordinates are used only to fetch the weather and are not stored.',
    '받은 좌표는 날씨를 부르는 데만 썼고 저장하거나 보내지 않았습니다.':
      'Your coordinates were used only to fetch the weather — not stored, not sent anywhere.',
    '자리는 찾았는데 날씨를 못 받았어요 — 없는 값을 지어내지 않습니다.':
      "I found the place but couldn't get the weather — I won't make up a value.",
    '날씨를 못 불러왔습니다': "Couldn't load the weather",
    '관측 구름 실패': 'Cloud observation failed',
    '옛 대륙 로드 실패': 'Ancient continents failed to load',
    '충돌구 로드 실패': 'Craters failed to load',
    '지진 로드 실패': 'Earthquakes failed to load',
    '물 로드 실패': 'Rivers failed to load',
    '예보 로드 실패': 'Forecast failed to load',
    '바람 로드 실패': 'Wind failed to load',
    '산맥 로드 실패': 'Mountains failed to load',
    '화석지 로드 실패': 'Fossil sites failed to load',
    '한반도 윤곽 로드 실패': 'Korea outline failed to load',
    '국가 폴리곤 로드 실패': 'Country polygons failed to load',
    '예전 자료로 메우지 못했다': 'could not fall back to older data',
    '출처:': 'Source:',
  };

  var lang = pick();
  var HAN = /[가-힣]/;
  // 공백을 한 칸으로 누른 열쇠. 사전을 두 벌로 적지 않으려고 여기서 만든다.
  var FLAT = {};
  Object.keys(EN).forEach(function (k) {
    var f = k.replace(/\s+/g, ' ');
    if (f !== k && FLAT[f] === undefined) FLAT[f] = EN[k];
  });

  function t(s) {
    if (lang !== 'en' || !s) return s;
    var k = String(s).trim();
    var hit = EN[k];
    if (hit === undefined) {
      // 마크업 안에서 줄바꿈·들여쓰기로 끊긴 문장은 열쇠와 글자가 다르다.
      // 공백을 한 칸으로 눌러 한 번 더 찾는다.
      var flat = k.replace(/\s+/g, ' ');
      if (flat !== k) hit = EN[flat] || FLAT[flat];
    }
    if (!hit) return s;   // 없거나 빈 값이면 원문 그대로 — 빈 값은 글자를 지워 버린다
    // 앞뒤 공백은 살려 둔다 — 붙여 쓰는 자리에서 글자가 달라붙는다.
    return String(s).replace(k, hit);
  }

  var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/;

  function sweep(root) {
    if (lang !== 'en' || !root) return;
    // <script> 본문은 건드리지 않는다. 코드 안의 한국어 문자열까지 바꿔 버린다.
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (nd) {
        return SKIP.test(nd.parentElement && nd.parentElement.tagName)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    var todo = [];
    while ((n = w.nextNode())) {
      if (n.nodeValue && HAN.test(n.nodeValue)) todo.push(n);
    }
    todo.forEach(function (node) {
      var out = t(node.nodeValue);
      if (out !== node.nodeValue) node.nodeValue = out;
    });
    // root 자신도 본다. 카드처럼 통째로 갈아 끼우는 자리에서는
    // 새로 붙는 것이 컨테이너가 아니라 버튼 하나일 때가 있다.
    var els = root.querySelectorAll ? [].slice.call(root.querySelectorAll('[title],[aria-label],[placeholder]')) : [];
    if (root.nodeType === 1 && root.hasAttribute &&
        (root.hasAttribute('title') || root.hasAttribute('aria-label') || root.hasAttribute('placeholder'))) {
      els.push(root);
    }
    els.forEach(function (el) {
      ['title', 'aria-label', 'placeholder'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && HAN.test(v)) {
          var out = t(v);
          if (out !== v) el.setAttribute(a, out);
        }
      });
    });
  }

  window.KIDS_I18N = {
    lang: lang,
    t: t,
    sweep: sweep,
    /* 자료가 이미 영어 이름을 들고 있으면(craters.json 의 en, mountains.json 의 en)
       여기 옮겨 적지 않고 그때 받아 넣는다. 옮겨 적으면 자료가 바뀔 때 갈라진다. */
    add: function (pairs) {
      if (lang !== 'en' || !pairs) return this;
      Object.keys(pairs).forEach(function (k) {
        var v = pairs[k];
        if (k && v && EN[k] === undefined) EN[k] = v;
      });
      sweep(document.body);
      return this;
    },
    /* 아직 안 옮긴 것을 알려준다. 사전을 채울 때 이걸 본다. */
    missing: function () {
      var out = [];
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (nd) {
          return SKIP.test(nd.parentElement && nd.parentElement.tagName)
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      var n;
      while ((n = w.nextNode())) {
        var v = (n.nodeValue || '').trim();
        if (v && HAN.test(v) && out.indexOf(v) < 0) out.push(v);
      }
      return out;
    },
  };

  if (lang === 'en') {
    document.documentElement.lang = 'en';
    var run = function () {
      sweep(document.body);
      // 지구가 그려지면서 새로 생기는 글자도 바꾼다.
      new MutationObserver(function (ms) {
        ms.forEach(function (m) {
          if (SKIP.test(m.target.parentElement && m.target.parentElement.tagName)) return;
          if (m.type === 'characterData') {
            var o = t(m.target.nodeValue);
            if (o !== m.target.nodeValue) m.target.nodeValue = o;
          }
          Array.prototype.forEach.call(m.addedNodes || [], function (nd) {
            if (nd.nodeType === 3) {
              var o2 = t(nd.nodeValue);
              if (o2 !== nd.nodeValue) nd.nodeValue = o2;
            } else if (nd.nodeType === 1) sweep(nd);
          });
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }
})();
