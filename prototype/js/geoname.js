// 좌표 → 사람이 알아듣는 위치
//
// 왜 필요한가
//   "대서양 25°북 5°W" 는 사람이 못 읽는다. 게다가 **틀렸다** —
//   25°N 5°W 는 사하라 사막 한복판이고 바다가 아니다.
//   예전 방식(today.js 의 roughPlace)이 경도 띠로만 갈라서
//   −70°W~20°E 를 전부 '대서양'이라 불렀다. 아프리카·유럽이 통째로 대서양이 됐다.
//
// 어떻게 고치나
//   세계 주요 지점 표를 들고 **가장 가까운 곳을 찾아** 방위와 거리를 붙인다.
//     "차드 · 은자메나에서 북동쪽 240 km"
//   역지오코딩 API 를 쓰면 더 정확하지만 카드 9장마다 외부 요청이 나간다.
//   이건 오프라인이고 즉시 끝난다.
//
// ⚠️ 한계를 숨기지 않는다.
//   · 표에 없는 곳은 가장 가까운 표 안의 지점을 기준으로 말한다.
//     그래서 태평양 한가운데는 "하와이에서 남서쪽 2,100 km" 처럼 멀어진다.
//     그게 정직하다 — 없는 지명을 지어내는 것보다 낫다.
//   · 국경은 판단하지 않는다. 가까운 지점의 **나라 이름을 빌려 쓸 뿐**이다.
//     국경 근처에서는 옆 나라로 말할 수 있다. 그래서 거리를 항상 같이 적는다.

const R = 6371;

/* [한글, 영문, 나라(ko), 나라(en), 위도, 경도]
   ⚠️ 수도 위주로 고르되, 바다 한가운데를 설명하려면 **섬**이 꼭 필요하다.
      섬이 없으면 태평양 한복판이 "도쿄에서 5,000km" 가 된다. */
const P = [
  // ── 동아시아
  ['서울','Seoul','대한민국','South Korea',37.57,126.98],
  ['부산','Busan','대한민국','South Korea',35.18,129.08],
  ['평양','Pyongyang','북한','North Korea',39.02,125.75],
  ['도쿄','Tokyo','일본','Japan',35.68,139.69],
  ['삿포로','Sapporo','일본','Japan',43.06,141.35],
  ['오키나와','Okinawa','일본','Japan',26.21,127.68],
  ['베이징','Beijing','중국','China',39.90,116.41],
  ['상하이','Shanghai','중국','China',31.23,121.47],
  ['광저우','Guangzhou','중국','China',23.13,113.26],
  ['우루무치','Urumqi','중국','China',43.83,87.62],
  ['라싸','Lhasa','중국','China',29.65,91.14],
  ['타이베이','Taipei','대만','Taiwan',25.03,121.57],
  ['홍콩','Hong Kong','홍콩','Hong Kong',22.32,114.17],
  ['울란바토르','Ulaanbaatar','몽골','Mongolia',47.89,106.91],
  // ── 동남아·남아시아
  ['하노이','Hanoi','베트남','Vietnam',21.03,105.85],
  ['호치민','Ho Chi Minh City','베트남','Vietnam',10.82,106.63],
  ['방콕','Bangkok','태국','Thailand',13.76,100.50],
  ['프놈펜','Phnom Penh','캄보디아','Cambodia',11.56,104.92],
  ['비엔티안','Vientiane','라오스','Laos',17.98,102.63],
  ['양곤','Yangon','미얀마','Myanmar',16.87,96.20],
  ['쿠알라룸푸르','Kuala Lumpur','말레이시아','Malaysia',3.14,101.69],
  ['싱가포르','Singapore','싱가포르','Singapore',1.35,103.82],
  ['자카르타','Jakarta','인도네시아','Indonesia',-6.21,106.85],
  ['수라바야','Surabaya','인도네시아','Indonesia',-7.25,112.75],
  ['마카사르','Makassar','인도네시아','Indonesia',-5.15,119.43],
  ['자야푸라','Jayapura','인도네시아','Indonesia',-2.53,140.72],
  ['마닐라','Manila','필리핀','Philippines',14.60,120.98],
  ['다바오','Davao','필리핀','Philippines',7.19,125.46],
  ['델리','Delhi','인도','India',28.61,77.21],
  ['뭄바이','Mumbai','인도','India',19.08,72.88],
  ['첸나이','Chennai','인도','India',13.08,80.27],
  ['콜카타','Kolkata','India','India',22.57,88.36],
  ['다카','Dhaka','방글라데시','Bangladesh',23.81,90.41],
  ['카트만두','Kathmandu','네팔','Nepal',27.72,85.32],
  ['콜롬보','Colombo','스리랑카','Sri Lanka',6.93,79.86],
  ['이슬라마바드','Islamabad','파키스탄','Pakistan',33.68,73.05],
  ['카라치','Karachi','파키스탄','Pakistan',24.86,67.01],
  ['카불','Kabul','아프가니스탄','Afghanistan',34.53,69.17],
  // ── 중앙아시아·중동
  ['타슈켄트','Tashkent','우즈베키스탄','Uzbekistan',41.30,69.24],
  ['아스타나','Astana','카자흐스탄','Kazakhstan',51.17,71.43],
  ['알마티','Almaty','카자흐스탄','Kazakhstan',43.24,76.89],
  ['비슈케크','Bishkek','키르기스스탄','Kyrgyzstan',42.87,74.59],
  ['아슈하바트','Ashgabat','투르크메니스탄','Turkmenistan',37.95,58.38],
  ['테헤란','Tehran','이란','Iran',35.69,51.39],
  ['바그다드','Baghdad','이라크','Iraq',33.31,44.37],
  ['리야드','Riyadh','사우디아라비아','Saudi Arabia',24.71,46.68],
  ['두바이','Dubai','아랍에미리트','UAE',25.20,55.27],
  ['도하','Doha','카타르','Qatar',25.29,51.53],
  ['무스카트','Muscat','오만','Oman',23.59,58.41],
  ['사나','Sanaa','예멘','Yemen',15.37,44.19],
  ['암만','Amman','요르단','Jordan',31.95,35.93],
  ['예루살렘','Jerusalem','이스라엘','Israel',31.77,35.21],
  ['베이루트','Beirut','레바논','Lebanon',33.89,35.50],
  ['다마스쿠스','Damascus','시리아','Syria',33.51,36.29],
  ['앙카라','Ankara','튀르키예','Türkiye',39.93,32.86],
  ['이스탄불','Istanbul','튀르키예','Türkiye',41.01,28.98],
  ['바쿠','Baku','아제르바이잔','Azerbaijan',40.41,49.87],
  ['트빌리시','Tbilisi','조지아','Georgia',41.72,44.83],
  ['예레반','Yerevan','아르메니아','Armenia',40.18,44.51],
  // ── 유럽
  ['모스크바','Moscow','러시아','Russia',55.76,37.62],
  ['상트페테르부르크','St Petersburg','러시아','Russia',59.94,30.34],
  ['노보시비르스크','Novosibirsk','러시아','Russia',55.01,82.94],
  ['야쿠츠크','Yakutsk','러시아','Russia',62.03,129.73],
  ['블라디보스토크','Vladivostok','러시아','Russia',43.12,131.89],
  ['무르만스크','Murmansk','러시아','Russia',68.97,33.08],
  ['키이우','Kyiv','우크라이나','Ukraine',50.45,30.52],
  ['민스크','Minsk','벨라루스','Belarus',53.90,27.57],
  ['바르샤바','Warsaw','폴란드','Poland',52.23,21.01],
  ['베를린','Berlin','독일','Germany',52.52,13.40],
  ['파리','Paris','프랑스','France',48.86,2.35],
  ['런던','London','영국','United Kingdom',51.51,-0.13],
  ['에든버러','Edinburgh','영국','United Kingdom',55.95,-3.19],
  ['더블린','Dublin','아일랜드','Ireland',53.35,-6.26],
  ['마드리드','Madrid','스페인','Spain',40.42,-3.70],
  ['리스본','Lisbon','포르투갈','Portugal',38.72,-9.14],
  ['로마','Rome','이탈리아','Italy',41.90,12.50],
  ['아테네','Athens','그리스','Greece',37.98,23.73],
  ['빈','Vienna','오스트리아','Austria',48.21,16.37],
  ['취리히','Zurich','스위스','Switzerland',47.38,8.54],
  ['암스테르담','Amsterdam','네덜란드','Netherlands',52.37,4.90],
  ['브뤼셀','Brussels','벨기에','Belgium',50.85,4.35],
  ['코펜하겐','Copenhagen','덴마크','Denmark',55.68,12.57],
  ['오슬로','Oslo','노르웨이','Norway',59.91,10.75],
  ['스톡홀름','Stockholm','스웨덴','Sweden',59.33,18.07],
  ['헬싱키','Helsinki','핀란드','Finland',60.17,24.94],
  ['레이캬비크','Reykjavik','아이슬란드','Iceland',64.15,-21.94],
  ['프라하','Prague','체코','Czechia',50.08,14.44],
  ['부다페스트','Budapest','헝가리','Hungary',47.50,19.04],
  ['부쿠레슈티','Bucharest','루마니아','Romania',44.43,26.10],
  ['소피아','Sofia','불가리아','Bulgaria',42.70,23.32],
  ['베오그라드','Belgrade','세르비아','Serbia',44.79,20.45],
  // ── 아프리카
  ['카이로','Cairo','이집트','Egypt',30.04,31.24],
  ['트리폴리','Tripoli','리비아','Libya',32.89,13.19],
  ['튀니스','Tunis','튀니지','Tunisia',36.81,10.18],
  ['알제','Algiers','알제리','Algeria',36.75,3.06],
  ['타만라세트','Tamanrasset','알제리','Algeria',22.79,5.53],
  ['라바트','Rabat','모로코','Morocco',34.02,-6.84],
  ['누악쇼트','Nouakchott','모리타니','Mauritania',18.08,-15.98],
  ['다카르','Dakar','세네갈','Senegal',14.72,-17.47],
  ['바마코','Bamako','말리','Mali',12.64,-8.00],
  ['톰북투','Timbuktu','말리','Mali',16.77,-3.01],
  ['니아메','Niamey','니제르','Niger',13.51,2.11],
  ['아가데즈','Agadez','니제르','Niger',16.97,7.99],
  ['은자메나','N’Djamena','차드','Chad',12.13,15.06],
  ['하르툼','Khartoum','수단','Sudan',15.50,32.56],
  ['아디스아바바','Addis Ababa','에티오피아','Ethiopia',9.03,38.74],
  ['모가디슈','Mogadishu','소말리아','Somalia',2.05,45.32],
  ['나이로비','Nairobi','케냐','Kenya',-1.29,36.82],
  ['캄팔라','Kampala','우간다','Uganda',0.35,32.58],
  ['다르에스살람','Dar es Salaam','탄자니아','Tanzania',-6.79,39.21],
  ['아부자','Abuja','나이지리아','Nigeria',9.06,7.49],
  ['라고스','Lagos','나이지리아','Nigeria',6.52,3.38],
  ['아크라','Accra','가나','Ghana',5.60,-0.19],
  ['아비장','Abidjan','코트디부아르','Côte d’Ivoire',5.36,-4.01],
  ['야운데','Yaoundé','카메룬','Cameroon',3.85,11.50],
  ['킨샤사','Kinshasa','콩고민주공화국','DR Congo',-4.44,15.27],
  ['루안다','Luanda','앙골라','Angola',-8.84,13.23],
  ['루사카','Lusaka','잠비아','Zambia',-15.39,28.32],
  ['하라레','Harare','짐바브웨','Zimbabwe',-17.83,31.05],
  ['빈트후크','Windhoek','나미비아','Namibia',-22.56,17.08],
  ['가보로네','Gaborone','보츠와나','Botswana',-24.63,25.92],
  ['요하네스버그','Johannesburg','남아프리카공화국','South Africa',-26.20,28.05],
  ['케이프타운','Cape Town','남아프리카공화국','South Africa',-33.92,18.42],
  ['안타나나리보','Antananarivo','마다가스카르','Madagascar',-18.88,47.51],
  // ── 아메리카
  ['워싱턴','Washington DC','미국','United States',38.91,-77.04],
  ['뉴욕','New York','미국','United States',40.71,-74.01],
  ['시카고','Chicago','미국','United States',41.88,-87.63],
  ['덴버','Denver','미국','United States',39.74,-104.99],
  ['로스앤젤레스','Los Angeles','미국','United States',34.05,-118.24],
  ['시애틀','Seattle','미국','United States',47.61,-122.33],
  ['마이애미','Miami','미국','United States',25.76,-80.19],
  ['앵커리지','Anchorage','미국','United States',61.22,-149.90],
  ['호놀룰루','Honolulu','미국 하와이','Hawaii, US',21.31,-157.86],
  ['오타와','Ottawa','캐나다','Canada',45.42,-75.70],
  ['밴쿠버','Vancouver','캐나다','Canada',49.28,-123.12],
  ['이칼루이트','Iqaluit','캐나다','Canada',63.75,-68.52],
  ['누크','Nuuk','그린란드','Greenland',64.18,-51.69],
  ['멕시코시티','Mexico City','멕시코','Mexico',19.43,-99.13],
  ['아바나','Havana','쿠바','Cuba',23.11,-82.37],
  ['킹스턴','Kingston','자메이카','Jamaica',18.02,-76.80],
  ['산후안','San Juan','푸에르토리코','Puerto Rico',18.47,-66.11],
  ['파나마시티','Panama City','파나마','Panama',8.98,-79.52],
  ['보고타','Bogotá','콜롬비아','Colombia',4.71,-74.07],
  ['카라카스','Caracas','베네수엘라','Venezuela',10.48,-66.90],
  ['키토','Quito','에콰도르','Ecuador',-0.18,-78.47],
  ['리마','Lima','페루','Peru',-12.05,-77.04],
  ['라파스','La Paz','볼리비아','Bolivia',-16.50,-68.15],
  ['브라질리아','Brasília','브라질','Brazil',-15.79,-47.88],
  ['상파울루','São Paulo','브라질','Brazil',-23.55,-46.63],
  ['마나우스','Manaus','브라질','Brazil',-3.12,-60.02],
  ['헤시피','Recife','브라질','Brazil',-8.05,-34.88],
  ['아순시온','Asunción','파라과이','Paraguay',-25.26,-57.58],
  ['몬테비데오','Montevideo','우루과이','Uruguay',-34.90,-56.16],
  ['부에노스아이레스','Buenos Aires','아르헨티나','Argentina',-34.60,-58.38],
  ['산티아고','Santiago','칠레','Chile',-33.45,-70.67],
  ['푼타아레나스','Punta Arenas','칠레','Chile',-53.16,-70.91],
  // ── 오세아니아
  ['캔버라','Canberra','호주','Australia',-35.28,149.13],
  ['시드니','Sydney','호주','Australia',-33.87,151.21],
  ['퍼스','Perth','호주','Australia',-31.95,115.86],
  ['다윈','Darwin','호주','Australia',-12.46,130.84],
  ['앨리스스프링스','Alice Springs','호주','Australia',-23.70,133.88],
  ['웰링턴','Wellington','뉴질랜드','New Zealand',-41.29,174.78],
  ['오클랜드','Auckland','뉴질랜드','New Zealand',-36.85,174.76],
  ['포트모르즈비','Port Moresby','파푸아뉴기니','Papua New Guinea',-9.44,147.18],
  ['수바','Suva','피지','Fiji',-18.14,178.44],
  ['누메아','Nouméa','뉴칼레도니아','New Caledonia',-22.28,166.46],
  ['아피아','Apia','사모아','Samoa',-13.83,-171.77],
  ['파페에테','Papeete','타히티','Tahiti',-17.54,-149.57],
  ['하가트나','Hagåtña','괌','Guam',13.47,144.75],
  ['마주로','Majuro','마셜제도','Marshall Islands',7.09,171.38],
  ['타라와','Tarawa','키리바시','Kiribati',1.33,172.98],
  // ── 바다 한가운데를 설명하기 위한 섬·기지
  ['아조레스','Azores','포르투갈','Portugal',37.74,-25.68],
  ['마데이라','Madeira','포르투갈','Portugal',32.65,-16.91],
  ['카나리아제도','Canary Islands','스페인','Spain',28.29,-16.62],
  ['카보베르데','Cabo Verde','카보베르데','Cabo Verde',14.93,-23.51],
  ['버뮤다','Bermuda','버뮤다','Bermuda',32.29,-64.78],
  ['어센션섬','Ascension Island','어센션','Ascension',-7.95,-14.36],
  ['세인트헬레나','St Helena','세인트헬레나','St Helena',-15.96,-5.72],
  ['트리스탄다쿠냐','Tristan da Cunha','트리스탄다쿠냐','Tristan da Cunha',-37.11,-12.29],
  ['포클랜드','Falkland Islands','포클랜드','Falkland Islands',-51.70,-57.85],
  ['사우스조지아','South Georgia','사우스조지아','South Georgia',-54.28,-36.51],
  ['부베섬','Bouvet Island','부베','Bouvet',-54.42,3.36],
  ['갈라파고스','Galápagos','에콰도르','Ecuador',-0.74,-90.31],
  ['이스터섬','Easter Island','칠레','Chile',-27.11,-109.35],
  ['미드웨이','Midway','미국','United States',28.20,-177.37],
  ['알류샨열도','Aleutian Islands','미국','United States',52.94,-173.16],
  ['웨이크섬','Wake Island','미국','United States',19.28,166.65],
  ['몰디브','Maldives','몰디브','Maldives',4.18,73.51],
  ['세이셸','Seychelles','세이셸','Seychelles',-4.68,55.49],
  ['모리셔스','Mauritius','모리셔스','Mauritius',-20.35,57.55],
  ['레위니옹','Réunion','프랑스','France',-21.12,55.54],
  ['디에고가르시아','Diego Garcia','영국령','British Indian Ocean Terr.',-7.31,72.41],
  ['크리스마스섬','Christmas Island','호주','Australia',-10.49,105.63],
  ['케르겔렌','Kerguelen','프랑스령','French Southern Terr.',-49.35,70.22],
  ['맥쿼리섬','Macquarie Island','호주','Australia',-54.62,158.86],
  ['채텀제도','Chatham Islands','뉴질랜드','New Zealand',-43.95,-176.56],
  ['스발바르','Svalbard','노르웨이','Norway',78.22,15.65],
  ['얀마옌','Jan Mayen','노르웨이','Norway',70.98,-8.54],
  ['프란츠요제프','Franz Josef Land','러시아','Russia',80.67,54.00],
  ['맥머도기지','McMurdo Station','남극','Antarctica',-77.85,166.67],
  ['보스토크기지','Vostok Station','남극','Antarctica',-78.46,106.84],
  ['아문센스콧기지','Amundsen–Scott','남극','Antarctica',-90.00,0.00],
  ['쇼와기지','Syowa Station','남극','Antarctica',-69.00,39.58],
  ['로테라기지','Rothera Station','남극','Antarctica',-67.57,-68.13],
];

const rad = d => d * Math.PI / 180;

function distKm(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2
          + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 시작점에서 목표점을 봤을 때의 방위각(0=북, 시계방향) */
function bearing(aLat, aLon, bLat, bLon) {
  const φ1 = rad(aLat), φ2 = rad(bLat), Δλ = rad(bLon - aLon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const DIR_KO = ['북','북동','동','남동','남','남서','서','북서'];
const DIR_EN = ['N','NE','E','SE','S','SW','W','NW'];
function dirName(deg, ko) {
  const i = Math.round(deg / 45) % 8;
  return (ko ? DIR_KO : DIR_EN)[i];
}

/* 거리 표기 — 가까우면 10km 단위, 멀면 100km 단위로 끊는다.
   ⚠️ 1km 단위로 적으면 정밀해 보이지만 격자 자료(약 550km 간격)에는 없는 정밀도다. */
function distText(km, ko) {
  if (km < 10) return ko ? '바로 그 지점' : 'right there';
  const v = km < 200 ? Math.round(km / 10) * 10 : Math.round(km / 50) * 50;
  return ko ? `${v.toLocaleString()} km` : `${v.toLocaleString()} km`;
}

/**
 * 좌표를 사람이 알아듣는 문장으로.
 * @returns {{ text, country, near, km, dir, lat, lon }}
 */
export function describePlace(lat, lon, ko = true) {
  const L = ((lon + 180) % 360 + 360) % 360 - 180;
  let best = null;
  for (const p of P) {
    const d = distKm(lat, L, p[4], p[5]);
    if (!best || d < best.d) best = { p, d };
  }
  const [nameKo, nameEn, ctryKo, ctryEn, plat, plon] = best.p;
  const near = ko ? nameKo : nameEn;
  const country = ko ? ctryKo : ctryEn;
  // 기준점에서 **목표를 향한** 방위를 말한다 ("은자메나에서 북동쪽")
  const dir = dirName(bearing(plat, plon, lat, L), ko);
  const km = best.d;

  let text;
  if (km < 10) {
    text = ko ? `${country} · ${near}` : `${near}, ${country}`;
  } else if (km <= 600) {
    // 그 나라 안이거나 바로 근처 — 나라 이름을 앞세운다
    text = ko ? `${country} · ${near}에서 ${dir}쪽 ${distText(km, ko)}`
              : `${country} · ${distText(km, ko)} ${dir} of ${near}`;
  } else {
    /* 600km 을 넘으면 그 나라라고 말하지 않는다 — 십중팔구 바다나 오지다.
       ⚠️ 여기서 나라 이름을 붙이면 태평양 한가운데를 '미국'이라 부르게 된다. */
    text = ko ? `${near}에서 ${dir}쪽 ${distText(km, ko)}`
              : `${distText(km, ko)} ${dir} of ${near}`;
  }
  return { text, country, near, km, dir, lat, lon: L };
}

/** 위경도를 짧게 (보조 표기용) */
export function latLonText(lat, lon, ko = true) {
  const L = ((lon + 180) % 360 + 360) % 360 - 180;
  const ns = lat >= 0 ? (ko ? '북' : 'N') : (ko ? '남' : 'S');
  const ew = L >= 0 ? (ko ? '동' : 'E') : (ko ? '서' : 'W');
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(L).toFixed(1)}°${ew}`;
}

/* ── 미니 지도 ────────────────────────────────────────────────
   NASA GIBS 의 **정적 지형·수심 basemap** 타일 한 장을 그대로 쓴다.
   ⚠️ 날짜가 필요 없는 레이어라 "오늘 자료가 아직 없다" 문제가 없다.
   ⚠️ 한 장 약 18KB. 카드마다 한 장이라 레이어를 새로 만드는 것보다 훨씬 싸다.
      (실측: BlueMarble_ShadedRelief_Bathymetry z3 → 18,668 B) */
const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best'
                + '/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8';

/**
 * 이 좌표를 **가운데에 둔** 미니 지도.
 *
 * ⚠️ 처음엔 타일을 그대로 깔고 점만 비율 위치에 찍었다. 그러면 점이 타일 구석에
 *    붙어 주변이 안 보인다 (실제로 그랬다). 타일을 크게 깔고 **밀어서** 점을 중앙에 둔다.
 *
 * @param box   썸네일 한 변(px)
 * @param tile  타일을 몇 px 로 깔지 — 클수록 좁은 범위가 크게 보인다
 * @returns {{url, left, top, tile}}  left/top 은 img 에 그대로 넣을 px 오프셋
 */
export function miniMap(lat, lon, z = 4, box = 56, tile = 200) {
  const L = ((lon + 180) % 360 + 360) % 360 - 180;
  // ⚠️ 웹메르카토르는 |위도| 85.05 를 넘지 못한다. 남극 기지 좌표가 여기서 터진다.
  const cl = Math.max(-85.05, Math.min(85.05, lat));
  const n = 2 ** z;
  const x = (L + 180) / 360 * n;
  const yRad = Math.log(Math.tan(Math.PI / 4 + rad(cl) / 2));
  const y = (1 - yRad / Math.PI) / 2 * n;
  const tx = Math.min(n - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(n - 1, Math.max(0, Math.floor(y)));
  const fx = x - tx, fy = y - ty;          // 타일 안 위치 0~1
  return {
    url: `${GIBS_BASE}/${z}/${ty}/${tx}.jpg`,
    tile,
    left: Math.round(box / 2 - fx * tile),  // 점이 상자 중앙에 오도록 민다
    top:  Math.round(box / 2 - fy * tile),
  };
}
