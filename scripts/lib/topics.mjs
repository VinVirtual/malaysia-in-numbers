// How each dataset is shown: the headline number, the charts on its page, the words
// around them (English first, Malay second) and the caveats its source states.
// Malay CPI division names are DOSM's own (MCOICOP lookup, open.dosm.gov.my/data-catalogue/mcoicop).

export const CPI_DIVISIONS = Object.freeze({
  '01': ['Food & beverages', 'Makanan & minuman'],
  '02': ['Alcohol & tobacco', 'Minuman alkohol & tembakau'],
  '03': ['Clothing & footwear', 'Pakaian & kasut'],
  '04': ['Housing, water, electricity & gas', 'Perumahan, air, elektrik, gas & bahan api lain'],
  '05': ['Furnishings & household', 'Hiasan, perkakasan & penyelenggaraan isi rumah'],
  '06': ['Health', 'Kesihatan'],
  '07': ['Transport', 'Pengangkutan'],
  '08': ['Information & communication', 'Maklumat & komunikasi'],
  '09': ['Recreation, sport & culture', 'Rekreasi, sukan & kebudayaan'],
  '10': ['Education', 'Pendidikan'],
  '11': ['Restaurants & accommodation', 'Restoran & perkhidmatan penginapan'],
  '12': ['Insurance & financial services', 'Insurans & perkhidmatan kewangan'],
  '13': ['Personal care & miscellaneous', 'Penjagaan diri, perlindungan sosial & pelbagai'],
});

const POP_GROUPS = [
  ['bumi_malay', 'Malay'],
  ['bumi_other', 'Other Bumiputera'],
  ['chinese', 'Chinese'],
  ['indian', 'Indian'],
  ['other_citizen', 'Other citizens'],
  ['other_noncitizen', 'Non-citizens'],
];

// headline.change: 'pp' (percentage points), 'pct' (per cent) or 'sen' (ringgit cents).
// headline.compare: 'prev' (the period before) or 'year' (the same period a year before).
// chart.series: [key, label, colour slot 1-5, short label for direct labelling].
export const TOPICS = Object.freeze([
  {
    slug: 'fuel',
    dataset: 'fuelprice',
    title: 'Fuel prices',
    titleMs: 'Harga bahan api',
    size: 'xl',
    headline: { key: 'ron95', label: 'RON95 petrol, unsubsidised', labelMs: 'Petrol RON95, tanpa subsidi', fmt: 'rm2', per: 'per litre', change: 'sen', compare: 'prev', spark: 52 },
    dek: 'Pump prices set each week by the Ministry of Finance under the Automatic Pricing Mechanism.',
    charts: [
      {
        id: 'pump-prices', type: 'line', fmt: 'rm2', title: 'Pump prices since 2017', titleMs: 'Harga pam sejak 2017',
        series: [['ron97', 'RON97', 2, 'RON97'], ['ron95', 'RON95 (unsubsidised)', 1, 'RON95'], ['diesel', 'Diesel, Peninsular', 4, 'Diesel'], ['ron95_budi95', 'RON95 BUDI95 (subsidised)', 3, 'BUDI95']],
      },
      {
        id: 'last-year', type: 'line', fmt: 'rm2', last: 53, title: 'The last 12 months, week by week', titleMs: '12 bulan terakhir, mingguan',
        series: [['ron97', 'RON97', 2, 'RON97'], ['ron95', 'RON95 (unsubsidised)', 1, 'RON95'], ['diesel', 'Diesel, Peninsular', 4, 'Diesel'], ['diesel_east', 'Diesel, Sabah, Sarawak & Labuan', 5, 'Diesel East']],
      },
    ],
    notes: [
      'Prices are set weekly; announcements moved from Fridays to Wednesdays in March 2021.',
      'From June 2024 diesel is priced separately for Peninsular Malaysia and for Sabah, Sarawak and Labuan, after the subsidy was removed in the Peninsula.',
      'From 30 September 2025, eligible individuals pay the subsidised BUDI95 price for RON95; the general-market price is the unsubsidised one.',
    ],
  },
  {
    slug: 'inflation',
    dataset: 'cpi_headline_inflation',
    title: 'Inflation',
    titleMs: 'Inflasi',
    size: 'l',
    headline: { key: 'yoy_overall', label: 'Consumer prices, year on year', labelMs: 'Harga pengguna, tahun ke tahun', fmt: 'pct1', change: 'pp', compare: 'prev', spark: 36 },
    dek: 'Headline CPI inflation: the change in the price of a fixed basket of goods and services against the same month a year earlier.',
    charts: [
      { id: 'headline', type: 'line', fmt: 'pct1', zero: true, title: 'Headline inflation, year on year', titleMs: 'Inflasi keseluruhan, tahun ke tahun', series: [['yoy_overall', 'All items', 1, 'All items']] },
      { id: 'by-division', type: 'hbar', fmt: 'pct1', divisions: true, title: 'By division, latest month', titleMs: 'Mengikut bahagian, bulan terkini' },
      { id: 'month-on-month', type: 'bar', fmt: 'pct1', zero: true, last: 36, title: 'Month on month, last three years', titleMs: 'Bulan ke bulan, tiga tahun terakhir', series: [['mom_overall', 'All items, month on month', 1]] },
    ],
    notes: [
      'The basket is held constant in quantity and quality, so the index measures price change, not spending.',
      'Divisions follow MCOICOP, DOSM’s version of the UN classification of consumption by purpose.',
    ],
  },
  {
    slug: 'jobs',
    dataset: 'lfs_month',
    title: 'Jobs',
    titleMs: 'Pekerjaan',
    size: 'm',
    headline: { key: 'u_rate', label: 'Unemployment rate', labelMs: 'Kadar pengangguran', fmt: 'pct1', change: 'pp', compare: 'prev', spark: 36 },
    dek: 'Monthly estimates from the Labour Force Survey: people aged 15 to 64 who are working, looking for work, or neither.',
    charts: [
      { id: 'unemployment', type: 'line', fmt: 'pct1', zero: true, title: 'Unemployment rate', titleMs: 'Kadar pengangguran', series: [['u_rate', 'Unemployment rate', 1]] },
      { id: 'participation', type: 'line', fmt: 'pct1', title: 'Labour force participation rate', titleMs: 'Kadar penyertaan tenaga buruh', series: [['p_rate', 'Participation rate', 3]] },
      { id: 'unemployed', type: 'line', fmt: 'people_k', zero: true, title: 'Unemployed people', titleMs: 'Bilangan penganggur', series: [['unemployed', 'Unemployed', 4]] },
    ],
    notes: ['Monthly figures are survey estimates and are revised; the quarterly survey is the fuller source.'],
  },
  {
    slug: 'gdp',
    dataset: 'gdp_qtr_real',
    title: 'Economic growth',
    titleMs: 'Pertumbuhan ekonomi',
    size: 'm',
    headline: { key: 'growth_yoy', label: 'Real GDP growth, year on year', labelMs: 'Pertumbuhan KDNK benar, tahun ke tahun', fmt: 'pct1', change: 'pp', compare: 'prev', spark: 16, sparkType: 'bar' },
    dek: 'Gross domestic product at constant 2015 prices, so the figures show changes in output rather than in prices.',
    charts: [
      { id: 'growth', type: 'bar', fmt: 'pct1', zero: true, title: 'GDP growth, year on year, by quarter', titleMs: 'Pertumbuhan KDNK suku tahunan, tahun ke tahun', series: [['growth_yoy', 'GDP growth, year on year', 1]] },
      { id: 'level', type: 'line', fmt: 'rmbn_m', title: 'GDP per quarter, constant 2015 prices', titleMs: 'KDNK suku tahunan, harga malar 2015', series: [['abs', 'GDP, constant 2015 prices', 1]] },
    ],
    notes: ['Quarterly GDP is revised as fuller data arrive; the newest quarters change most.'],
  },
  {
    slug: 'trade',
    dataset: 'trade_sitc_1d',
    title: 'Trade',
    titleMs: 'Perdagangan',
    size: 'm',
    headline: { key: 'exports', label: 'Exports in the month', labelMs: 'Eksport bulanan', fmt: 'rmbn', change: 'pct', compare: 'year', spark: 36 },
    dek: 'The value of goods exported and imported each month, all SITC sections together.',
    charts: [
      { id: 'exports-imports', type: 'line', fmt: 'rmbn', zero: true, title: 'Exports and imports', titleMs: 'Eksport dan import', series: [['exports', 'Exports', 1, 'Exports'], ['imports', 'Imports', 2, 'Imports']] },
      { id: 'balance', type: 'bar', fmt: 'rmbn', zero: true, last: 36, derived: 'balance', title: 'Trade balance, last three years', titleMs: 'Imbangan dagangan, tiga tahun terakhir', series: [['balance', 'Exports minus imports', 3]] },
    ],
    notes: ['Values are in current ringgit, not adjusted for prices or seasons, so compare a month with the same month a year before.'],
  },
  {
    slug: 'ringgit',
    dataset: 'exchangerates',
    title: 'The ringgit',
    titleMs: 'Ringgit',
    size: 'm',
    headline: { key: 'usd', label: 'Ringgit per US dollar, monthly average', labelMs: 'Ringgit bagi setiap dolar AS, purata bulanan', fmt: 'rate4', change: 'pct', compare: 'prev', spark: 36 },
    dek: 'Bank Negara Malaysia’s monthly average exchange rates. A higher number means one unit of the foreign currency costs more ringgit: the ringgit is weaker against it.',
    charts: [
      { id: 'usd', type: 'line', fmt: 'rate4', title: 'US dollar', titleMs: 'Dolar AS', series: [['usd', 'RM per US dollar', 1]] },
      { id: 'sgd', type: 'line', fmt: 'rate4', title: 'Singapore dollar', titleMs: 'Dolar Singapura', series: [['sgd', 'RM per Singapore dollar', 3]] },
      { id: 'eur', type: 'line', fmt: 'rate4', title: 'Euro', titleMs: 'Euro', series: [['eur', 'RM per euro', 5]] },
      { id: 'cny', type: 'line', fmt: 'rate4', title: 'Chinese yuan', titleMs: 'Yuan China', series: [['cny', 'RM per yuan', 2]] },
    ],
    notes: ['Monthly averages of BNM’s rates (the dataset also has end-of-month, high and low values, not shown here). Each currency has its own chart and scale.'],
  },
  {
    slug: 'electricity',
    dataset: 'electricity_consumption',
    title: 'Electricity',
    titleMs: 'Elektrik',
    size: 'm',
    headline: { key: 'total', label: 'Electricity used in the month', labelMs: 'Penggunaan elektrik bulanan', fmt: 'gwh', change: 'pct', compare: 'year', spark: 36 },
    dek: 'Electricity consumed each month across Malaysia, in gigawatt-hours (millions of kilowatt-hours).',
    charts: [
      { id: 'total', type: 'line', fmt: 'gwh', zero: true, title: 'Total consumption', titleMs: 'Jumlah penggunaan', series: [['total', 'All sectors', 1]] },
      { id: 'by-sector', type: 'line', fmt: 'gwh', zero: true, title: 'Commercial and domestic use', titleMs: 'Penggunaan komersial dan domestik', series: [['local_commercial', 'Commercial, industrial & mining', 2, 'Commercial'], ['local_domestic', 'Domestic & public lighting', 3, 'Domestic']] },
    ],
    notes: ['Commercial use includes industry and mining; domestic use includes public lighting (source data dictionary). The source publishes with a lag of a few months.'],
  },
  {
    slug: 'population',
    dataset: 'population_malaysia',
    title: 'Population',
    titleMs: 'Penduduk',
    size: 'm',
    headline: { key: 'overall', label: 'People living in Malaysia', labelMs: 'Penduduk Malaysia', fmt: 'people_k', change: 'pct', compare: 'prev', spark: 30 },
    dek: 'Mid-year estimates of everyone living in Malaysia, citizens and non-citizens.',
    charts: [
      { id: 'total', type: 'line', fmt: 'people_k', zero: true, title: 'Population since 1970', titleMs: 'Penduduk sejak 1970', series: [['overall', 'Population', 1]] },
      { id: 'groups', type: 'hbar', fmt: 'people_k', groups: POP_GROUPS, title: 'By ethnic group and citizenship, latest year', titleMs: 'Mengikut kumpulan etnik dan kewarganegaraan, tahun terkini' },
    ],
    notes: [
      'Census years (1970, 1980, 1991, 2000, 2010, 2020) use adjusted census counts; other years are mid-year estimates by the cohort-component method.',
      'Group totals may not add up exactly because of rounding to one decimal place (in thousands).',
    ],
  },
]);

export const topicBySlug = (slug) => TOPICS.find((t) => t.slug === slug) ?? null;
