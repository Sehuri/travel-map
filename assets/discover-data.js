/* Curated city-level starter catalogue. Coordinates are approximate WGS84 [longitude, latitude].
 * Descriptions are original summaries; days, interests and pace are editorial suggestions.
 * Sources support place identity and highlights, not live hours, prices or navigation entrances. */
(function (root) {
  "use strict";
  const sources = {
    beijing: ["北京旅游网 · 景区资源", "https://s.visitbeijing.com.cn/attractions?star_rating=5&theme=2"],
    shanghai: ["上海市政府 · 城市游览线路", "https://www.shanghai.gov.cn/nw31406/20250123/15f458f237484349b2e886647d55b0ce.html"],
    nanjing: ["南京市政府 · 景区出行指引", "https://www.nanjing.gov.cn/msxx/202501/t20250124_5065142.html"],
    suzhou: ["苏州市政府 · 古城景区指南", "https://www.suzhou.gov.cn/szsrmzf/mszx/202506/58fab42a1d504178a12040d6ed1338e4.shtml"],
    garden: ["苏州市园林局 · 拙政园", "https://ylj.suzhou.gov.cn/szsylj/sjyc/201905/c1df393edc8745abb20e8a9bd5525782.shtml"],
    westlake: ["杭州文旅 · 西湖四季", "https://wgly.hangzhou.gov.cn/art/2020/8/12/art_1229505585_58935212.html"],
    lingyin: ["杭州文旅 · 灵隐景区", "https://wgly.hangzhou.gov.cn/art/2023/12/1/art_1229734028_58951314.html"],
    xixi: ["杭州文旅 · 西溪湿地", "https://wgly.hangzhou.gov.cn/art/2017/5/8/art_1229471480_58927806.html"],
    huangshan: ["黄山市政府 · 山水与古村线路", "https://www.huangshan.gov.cn/zwgk/public/6615714/9429301.html"],
    oldstreet: ["黄山市政府 · 古街", "https://www.huangshan.gov.cn/zjhs/sjhs/ghz/gj/index.html"],
    qingdao: ["青岛市政府 · 山海风景道", "https://www.qingdao.gov.cn/ywdt/zwyw/202412/t20241201_8641256.shtml"],
    gulangyu: ["厦门市政府 · 鼓浪屿指南", "https://www.xm.gov.cn/jdhy/rdhy/202407/t20240722_2879674.htm"],
    xiamen: ["厦门交通运输局 · 滨海游览", "https://jt.xm.gov.cn/tzxx/hyxw/202412/t20241218_2907516.htm"],
    chen: ["广州市政府 · 陈家祠与西关", "https://www.gz.gov.cn/zt/2025ycbjpxhd/tjjd/content/post_10329063.html"],
    yongqing: ["广州文旅 · 永庆坊", "https://wglj.gz.gov.cn/ztmb/gzhyn/ajjq/4a/content/post_8930795.html"],
    canton: ["广州文旅 · 广州塔", "https://wglj.gz.gov.cn/ztmb/gzhyn/ajjq/4a/content/post_8928935.html"],
    chengdu: ["商务部四川商务预报 · 成都文旅", "https://cif.mofcom.gov.cn/newsite/html/sichuan/html/282506/2023/5/12/1683879687433.html"],
    hongya: ["重庆文旅 · 洪崖洞", "https://whlyw.cq.gov.cn/zjwl/yzq/jqjd_1/202203/t20220304_10463056.html"],
    chongqing: ["重庆文旅 · 文旅资源", "https://whlyw.cq.gov.cn/zwgk_221/zfgkzcwj/qtwj/202608/t20260831_16007090.html"],
    wulong: ["重庆市政府 · 武隆喀斯特", "https://cq.gov.cn/ywdt/zwhd/qxdt/202507/t20250703_14772857.html"],
    xian: ["西安市政府 · 景区信息", "https://www.xa.gov.cn/ztzl/ztzl/lzledc/ywdc/1824366329290301442.html"],
    changsha: ["湖南文旅 · 长沙游览指南", "https://whhlyt.hunan.gov.cn/whhlyt/news/wlyw/202304/t20230425_29323425.html"],
    elephant: ["两江四湖·象山景区 · 象鼻山", "https://www.glljsh.com/category/xbs.html"],
    guilin: ["文化和旅游部 · 桂东北山水游", "https://zhuanti.mct.gov.cn/guangxi_detail/370.html"],
    cuihu: ["云南省政府 · 昆明历史文化", "https://www.yn.gov.cn/ywdt/zsdt/201902/t20190212_167223.html"],
    haigen: ["云南省体育局 · 滇池沿线", "https://tyj.yn.gov.cn/tyzx/zsty/202606/t20260615_3188732.html"],
    shilin: ["云南省林草局 · 石林", "https://lcj.yn.gov.cn/special/2025/0512/6616.html"],
    harbin: ["黑龙江文旅 · 哈尔滨游览地", "https://wlt.hlj.gov.cn/wlt/c114254/202304/c00_31599627.shtml"],
    sanya: ["三亚天涯区政府 · 旅游指南", "https://ty.sanya.gov.cn/tyqsite/jrty/202604/dbba77c214ad4980bfdb0f42ae40cb12.shtml"],
    luoyang: ["河南文旅 · 洛阳", "https://hct.henan.gov.cn/2025/05-21/3160322.html"]
  };
  const tags = {
    nature: { label: "山水自然", color: "#28785b", symbol: "山" },
    culture: { label: "历史人文", color: "#9c623a", symbol: "古" },
    food: { label: "美食寻味", color: "#ba543d", symbol: "味" },
    city: { label: "城市漫步", color: "#3a6c9a", symbol: "城" },
    coast: { label: "海滨度假", color: "#21818f", symbol: "海" },
    family: { label: "亲子休闲", color: "#8a639e", symbol: "乐" },
    hiking: { label: "徒步登山", color: "#637834", symbol: "行" }
  };
  // duration = suggested half-day units; remote places get a full day including local transfers.
  const p = (name, coord, category, interests, duration, description, source, area) =>
    ({ name, coord, category, interests, duration, description, source, area });
  const cities = [
    { id:"beijing", name:"北京", province:"北京市", coord:[116.40,39.90], days:[3,6], pace:["balanced","active"], tags:["culture","city","family"], intro:"红墙、古建与城市公园构成北京的一条文化线。把大馆和园林分开游览，留些时间在街巷里走走。", tip:"大馆和大型园林步行量较多；预约情况请查看各景区官方渠道。", places:[
      p("故宫博物院",[116.397,39.918],"culture",["culture","family"],2,"沿宫殿中轴与院落看建筑、藏品和空间秩序。","beijing","东城区"),
      p("天坛公园",[116.407,39.883],"culture",["culture","nature"],1,"祈年殿与林荫园路适合结合建筑观赏和散步。","beijing","东城区"),
      p("颐和园",[116.273,39.999],"nature",["culture","nature","family"],2,"沿昆明湖与长廊慢走，欣赏山水园林。","beijing","海淀区") ]},
    { id:"shanghai", name:"上海", province:"上海市", coord:[121.47,31.23], days:[2,5], pace:["relaxed","balanced"], tags:["city","culture","family","food"], intro:"黄浦江两岸的天际线与老城园林，把摩登和传统放进同一段旅程。想去乐园，可以单独留出一整天。", tip:"迪士尼与中心城区相距较远，建议独立安排，提前查看预约和入园规则。", places:[
      p("外滩",[121.490,31.240],"city",["city","culture"],1,"沿江步道看建筑群和浦东天际线。","shanghai","黄浦区"),
      p("豫园",[121.487,31.228],"culture",["culture","city"],1,"在园林山石、池水和楼阁之间感受江南造园。","shanghai","黄浦区"),
      p("上海迪士尼度假区",[121.667,31.144],"family",["family"],2,"把主题园区和游乐体验作为一天的主角。","shanghai","浦东新区") ]},
    { id:"nanjing", name:"南京", province:"江苏省", coord:[118.79,32.06], days:[1,4], pace:["relaxed","balanced"], tags:["culture","nature","food","city"], intro:"南京适合把山林、湖岸和秦淮街巷串起来。白天看古都风貌，晚上为街区散步与寻味留白。", tip:"钟山景区范围较大，别把所有步行景点挤在同一天。", places:[
      p("中山陵",[118.849,32.064],"culture",["culture","hiking"],2,"沿山势展开的纪念建筑与林荫步道。","nanjing","玄武区"),
      p("夫子庙秦淮风光带",[118.784,32.020],"food",["food","city","culture"],1,"在秦淮河畔逛街巷，感受老城灯火与小吃文化。","nanjing","秦淮区"),
      p("玄武湖",[118.789,32.076],"nature",["nature","family","city"],1,"沿湖慢走，把湖面、洲岛与城景一起收入视野。","nanjing","玄武区") ]},
    { id:"suzhou", name:"苏州", province:"江苏省", coord:[120.58,31.30], days:[1,3], pace:["relaxed","balanced"], tags:["culture","city","food","nature"], intro:"苏州的旅行节奏藏在园林与水巷里。挑一座园林细看，再沿河街散步，短假期也能收获完整的江南印象。", tip:"园林和古城街区可组合游览，热门园林先查预约。", places:[
      p("拙政园",[120.625,31.325],"culture",["culture","nature"],1,"以水景为线索，在亭廊与花木之间观察借景。","garden","姑苏区"),
      p("平江路",[120.628,31.316],"food",["food","city","culture"],1,"沿河街巷适合慢走和寻找江南点心。","suzhou","姑苏区"),
      p("虎丘",[120.575,31.338],"culture",["culture","nature","hiking"],1,"把古塔、山石与园林景观结合起来看。","suzhou","姑苏区") ]},
    { id:"hangzhou", name:"杭州", province:"浙江省", coord:[120.15,30.28], days:[1,4], pace:["relaxed","balanced"], tags:["nature","culture","city","family"], intro:"杭州把湖山放在了城市日常里。围绕西湖选一段岸线，再在山林或湿地里安排半天到一天的漫游。", tip:"湖区、灵隐和西溪各成片区，按片区安排更从容。", places:[
      p("西湖 · 苏堤",[120.135,30.240],"nature",["nature","city","family"],1,"沿堤岸看湖、桥和远山，适合轻松步行。","westlake","西湖区"),
      p("灵隐景区",[120.099,30.240],"culture",["culture","nature","hiking"],2,"寺院、溪流与石刻形成山林里的文化景观。","lingyin","西湖区"),
      p("西溪国家湿地公园",[120.057,30.270],"nature",["nature","family"],2,"在水道与绿地之间体验湿地风景。","xixi","西湖区") ]},
    { id:"huangshan", name:"黄山", province:"安徽省", coord:[118.33,29.71], days:[3,5], pace:["balanced","active"], tags:["nature","hiking","culture"], intro:"这里既有黄山山岳风景，也有徽州古村和老街。山上与山下适合分开安排，旅行层次会更丰富。", tip:"黄山风景区、宏村与屯溪并不相邻，建议各自安排一天；山岳游览留意天气。", places:[
      p("黄山风景区",[118.166,30.133],"hiking",["hiking","nature"],2,"看花岗岩峰、松树和山间云雾，适合有体力准备的登山体验。","huangshan","黄山区"),
      p("宏村",[117.986,30.002],"culture",["culture","nature","city"],2,"沿村落水系看粉墙黛瓦与池塘倒影。","huangshan","黟县"),
      p("屯溪老街",[118.301,29.706],"food",["culture","food","city"],1,"在街巷与店铺间感受徽州老城的生活气息。","oldstreet","屯溪区") ]},
    { id:"qingdao", name:"青岛", province:"山东省", coord:[120.38,36.07], days:[2,5], pace:["relaxed","balanced","active"], tags:["coast","nature","city","hiking"], intro:"青岛的海岸把老建筑、沙滩和山景串在一起。既可以在市区沿海慢走，也可以把一天交给崂山。", tip:"崂山有多个游览区，此处标示太清片区，建议与市区分日安排。", places:[
      p("栈桥",[120.316,36.062],"coast",["coast","city"],1,"从老城走向海面，看海湾与回澜阁。","qingdao","市南区"),
      p("八大关",[120.351,36.050],"city",["city","culture","coast"],1,"沿树荫街道看建筑，并走向邻近海岸。","qingdao","市南区"),
      p("崂山 · 太清游览区",[120.681,36.136],"hiking",["hiking","nature","coast"],2,"山、海与沿岸村落组合成更开阔的风景。","qingdao","崂山区") ]},
    { id:"xiamen", name:"厦门", province:"福建省", coord:[118.08,24.48], days:[2,4], pace:["relaxed","balanced"], tags:["coast","city","culture","family"], intro:"海岛小路和滨海步道让厦门很适合放慢速度。把鼓浪屿与本岛海岸分开游览，留些时间追一场海边日落。", tip:"鼓浪屿需要单独安排轮渡；海边活动和轮渡以当天公告为准。", places:[
      p("鼓浪屿",[118.063,24.447],"culture",["culture","coast","city"],2,"在岛上的建筑街巷间步行，感受海岛人文风景。","gulangyu","思明区"),
      p("环岛路 · 黄厝海滨",[118.162,24.433],"coast",["coast","family","nature"],1,"沿海岸散步，欣赏沙滩与开阔海面。","xiamen","思明区"),
      p("白城沙滩",[118.103,24.433],"coast",["coast","city","family"],1,"连接城市和海岸的轻松停留点。","xiamen","思明区") ]},
    { id:"guangzhou", name:"广州", province:"广东省", coord:[113.26,23.13], days:[2,4], pace:["relaxed","balanced"], tags:["food","culture","city","family"], intro:"广州适合从西关街巷走到珠江两岸。岭南建筑和日常饮食相伴，是一段愿意把时间花在逛与吃上的旅程。", tip:"西关与广州塔分处不同片区，留足市内交通和用餐时间。", places:[
      p("陈家祠",[113.240,23.129],"culture",["culture","family"],1,"细看岭南建筑中的雕刻与装饰工艺。","chen","荔湾区"),
      p("永庆坊",[113.236,23.114],"food",["food","culture","city"],1,"沿西关街巷寻找骑楼、地方小吃和文化空间。","yongqing","荔湾区"),
      p("广州塔",[113.324,23.106],"city",["city","family"],1,"从珠江畔欣赏城市地标与两岸景观。","canton","海珠区") ]},
    { id:"chengdu", name:"成都", province:"四川省", coord:[104.07,30.67], days:[2,5], pace:["relaxed","balanced"], tags:["food","culture","family","city"], intro:"成都可以在熊猫、文博与街巷之间切换。用宽松的节奏逛文化景点，把午后和晚餐留给城市生活。", tip:"熊猫基地独立安排更舒服，文博场馆先确认预约与开放安排。", places:[
      p("成都大熊猫繁育研究基地",[104.142,30.737],"family",["family","nature"],2,"沿园路观察大熊猫，结合科普展览认识它们。","chengdu","成华区"),
      p("武侯祠",[104.043,30.645],"culture",["culture","city"],1,"在祠庙与园林之间了解三国文化。","chengdu","武侯区"),
      p("杜甫草堂",[104.022,30.660],"culture",["culture","nature"],1,"把诗歌文化与林木庭院放进一次慢游。","chengdu","青羊区") ]},
    { id:"chongqing", name:"重庆", province:"重庆市", coord:[106.55,29.56], days:[3,6], pace:["balanced","active"], tags:["city","food","nature","hiking","culture"], intro:"重庆的城市体验来自坡道、江岸与层叠街区。如果假期更长，也可以在市域内安排武隆的喀斯特风景。", tip:"武隆离中心城区较远，单独留一天以上；短行程先玩主城。", places:[
      p("洪崖洞",[106.577,29.562],"city",["city","food"],1,"在江岸看层叠建筑与山城夜景。","hongya","渝中区"),
      p("磁器口",[106.444,29.583],"food",["food","culture","city"],1,"在古镇街巷体验巴渝风味和街市氛围。","chongqing","沙坪坝区"),
      p("武隆天生三桥",[107.772,29.429],"nature",["nature","hiking"],2,"沿峡谷步道看天然石桥与喀斯特地形。","wulong","武隆区") ]},
    { id:"xian", name:"西安", province:"陕西省", coord:[108.94,34.26], days:[2,5], pace:["balanced","active"], tags:["culture","food","city","family"], intro:"西安适合以古迹和博物馆为主线。城墙、大雁塔片区与临潼各有重点，用几天把不同的历史空间慢慢展开。", tip:"兵马俑位于临潼，建议独立安排，别与市区多个大景点赶在同一天。", places:[
      p("秦始皇帝陵博物院 · 兵马俑",[109.273,34.384],"culture",["culture","family"],2,"观察陶俑队列与展陈，理解秦代陵墓考古。","xian","临潼区"),
      p("西安城墙 · 永宁门",[108.942,34.253],"culture",["culture","city"],1,"从南门片区观察城墙、城门与古城轮廓。","xian","碑林区"),
      p("大雁塔",[108.964,34.219],"culture",["culture","city"],1,"围绕古塔与周边开放空间感受城市文化景观。","xian","雁塔区") ]},
    { id:"changsha", name:"长沙", province:"湖南省", coord:[112.97,28.23], days:[1,3], pace:["relaxed","balanced","active"], tags:["food","culture","city","nature"], intro:"长沙把山、江、洲和文博场馆放在一段短假期里。白天看山水和展览，晚上慢慢寻找街头风味。", tip:"博物院和热门景区先查预约，山路与洲上步行量可按体力调整。", places:[
      p("岳麓山",[112.933,28.185],"hiking",["hiking","nature","culture"],2,"沿林荫山路看山城相接的风景。","changsha","岳麓区"),
      p("橘子洲",[112.957,28.171],"nature",["nature","city","family"],1,"走进湘江中的洲岛，欣赏两岸山水城景。","changsha","岳麓区"),
      p("湖南博物院",[112.986,28.217],"culture",["culture","family"],1,"从馆藏与主题展览认识湖南的历史文化。","changsha","开福区") ]},
    { id:"guilin", name:"桂林", province:"广西壮族自治区", coord:[110.29,25.27], days:[3,6], pace:["balanced","active"], tags:["nature","hiking","culture"], intro:"桂林市域的山水不止在市区，也延伸到阳朔与龙胜。把江边、田园和梯田分成不同片区，会更适合慢慢看风景。", tip:"阳朔和龙胜分属不同方向，至少各留一天；水上项目按天气与景区安排选择。", places:[
      p("象鼻山",[110.291,25.266],"nature",["nature","city"],1,"在江畔看石山、水月洞与桂林市区风景。","elephant","象山区"),
      p("遇龙河 · 田园游览区",[110.441,24.813],"nature",["nature","hiking"],2,"峰林、水道与田野构成阳朔的田园景观。","guilin","阳朔县"),
      p("龙脊梯田 · 平安片区",[110.119,25.757],"hiking",["hiking","nature","culture"],2,"沿山间步道观看梯田曲线与村落。","guilin","龙胜各族自治县") ]},
    { id:"kunming", name:"昆明", province:"云南省", coord:[102.71,25.04], days:[2,5], pace:["relaxed","balanced"], tags:["nature","city","family","culture"], intro:"昆明适合围绕城市湖泊慢游，再用一天看石林。公园、湖岸与石峰让短途休闲也有变化。", tip:"石林位于市域东侧，建议独立安排；湖边与山地天气可能不同。", places:[
      p("翠湖公园",[102.701,25.050],"city",["city","nature","culture"],1,"环湖散步，结合周边文化空间看城市日常。","cuihu","五华区"),
      p("海埂公园",[102.662,24.956],"nature",["nature","family"],1,"在滇池畔欣赏湖面和远山。","haigen","西山区"),
      p("石林风景区",[103.325,24.813],"nature",["nature","hiking","family"],2,"走入石峰之间，观察喀斯特地貌的不同形态。","shilin","石林彝族自治县") ]},
    { id:"harbin", name:"哈尔滨", province:"黑龙江省", coord:[126.63,45.75], days:[2,4], pace:["relaxed","balanced"], tags:["city","culture","family","nature"], intro:"哈尔滨可以从建筑街区一直走到松花江畔。老街、广场与江北绿地各有风景，适合把城市漫步作为主线。", tip:"本页推荐常设景点；冰雪活动的开放时间需要另查当季公告。", places:[
      p("中央大街",[126.619,45.774],"city",["city","food","culture"],1,"沿步行街观察建筑与街头生活。","harbin","道里区"),
      p("圣索菲亚教堂广场",[126.626,45.769],"culture",["culture","city"],1,"从广场欣赏建筑外观与城市历史风貌。","harbin","道里区"),
      p("太阳岛风景区",[126.601,45.796],"nature",["nature","family"],2,"在江北岛屿绿地与园路中安排一段休闲游。","harbin","松北区") ]},
    { id:"sanya", name:"三亚", province:"海南省", coord:[109.51,18.25], days:[3,7], pace:["relaxed","balanced"], tags:["coast","nature","family"], intro:"三亚适合把假期交给海湾与沙滩。选择一片海湾住下来，再穿插海岛和滨海景点，留白也是旅程的一部分。", tip:"湾区之间有距离；海岛船班和水上项目请以当天风浪、天气与官方公告为准。", places:[
      p("亚龙湾",[109.638,18.226],"coast",["coast","family","nature"],2,"沿沙滩欣赏海湾，适合以休闲停留为主。","sanya","吉阳区"),
      p("天涯海角",[109.344,18.292],"coast",["coast","culture","family"],1,"看海岸岩石与滨海风景。","sanya","天涯区"),
      p("蜈支洲岛",[109.763,18.313],"coast",["coast","nature"],2,"海岛风景与海水体验适合独立安排一天。","sanya","海棠区") ]},
    { id:"luoyang", name:"洛阳", province:"河南省", coord:[112.45,34.62], days:[2,4], pace:["balanced","relaxed"], tags:["culture","food","city"], intro:"洛阳的古都印象可以从石窟、寺院与街区三条线展开。白天细看古迹，夜晚到街区感受另一种热闹。", tip:"龙门与白马寺分处不同方向，分日游览更舒服。", places:[
      p("龙门石窟",[112.471,34.555],"culture",["culture","nature"],2,"沿伊河山崖观察石窟与造像。","luoyang","洛龙区"),
      p("白马寺",[112.592,34.722],"culture",["culture"],1,"在寺院建筑与庭院中了解历史文化。","luoyang","瀍河回族区"),
      p("洛邑古城",[112.487,34.679],"city",["city","food","culture"],1,"在街区散步，感受古都主题的夜游氛围。","luoyang","老城区") ]}
  ];
  // Additional origin cities; visited cities are also merged by the UI.
  const origins = [
    ["天津",117.20,39.12],["石家庄",114.51,38.04],["太原",112.55,37.87],
    ["呼和浩特",111.75,40.84],["沈阳",123.43,41.80],["长春",125.32,43.82],
    ["合肥",117.23,31.82],["福州",119.30,26.07],["南昌",115.86,28.68],
    ["济南",117.00,36.67],["郑州",113.62,34.75],["武汉",114.30,30.60],
    ["南宁",108.37,22.82],["海口",110.33,20.03],["贵阳",106.63,26.65],
    ["拉萨",91.14,29.65],["兰州",103.83,36.06],["西宁",101.78,36.62],
    ["银川",106.23,38.49],["乌鲁木齐",87.62,43.83],["深圳",114.06,22.55],
    ["宁波",121.55,29.87],["温州",120.70,28.00],["泉州",118.68,24.87],
    ["珠海",113.57,22.27],["佛山",113.12,23.02],["东莞",113.75,23.02],
    ["大理",100.27,25.61],["丽江",100.23,26.88],["张家界",110.48,29.13]
  ].map(([name,lon,lat])=>({name,coord:[lon,lat]}));
  const catalogue = { version:1, updated:"2026-09-05", coordinateSystem:"WGS84", tags, sources, cities, origins };
  if (typeof module === "object" && module.exports) module.exports = catalogue;
  else root.TRAVEL_DISCOVER_DATA = catalogue;
})(typeof window !== "undefined" ? window : globalThis);
