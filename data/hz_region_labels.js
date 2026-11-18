/* 3D-only region labels; all coordinates use the demo's GCJ-02 projection.
 * Scenic POI positions: AMap place/text, checked 2026-11-05.
 * Outlines are cartographic approximations for highlighting, not official boundaries.
 * The urban extents reuse the demo's existing landmarks and urban-cluster data.
 */
(function () {
  const gis = window.HZ_REAL_GIS;
  const approximateRing = (c, rx, ry) => [
    [-.95,-.35],[-.65,-.85],[.05,-1],[.72,-.7],[1,-.05],
    [.8,.65],[.15,1],[-.6,.8],[-1,.25]
  ].map(([x,y]) => [c[0]+x*rx,c[1]+y*ry]);
  const landmark = id => gis.LANDMARKS.find(l => l.id === id).lngLat;
  window.HZ_REGION_LABELS = [
    {
      id:'westlake', name:'杭州西湖风景名胜区', priority:0,
      poiId:'B023B13L9M', poiLngLat:[120.121358,30.222692],
      labelLngLat:[120.1385,30.2435], height:5.4,
      outlineKind:'approximate-scenic-extent',
      source:'AMap place/text + overview of the West Lake scenic area',
      reference:'https://westlake.hangzhou.gov.cn/attach/-1/2010091025032014399.pdf',
      polygon:[[120.1585,30.2645],[120.144,30.273],[120.121,30.279],
        [120.099,30.271],[120.079,30.252],[120.079,30.226],
        [120.09,30.201],[120.118,30.187],[120.14,30.199],
        [120.156,30.218],[120.166,30.237],[120.163,30.253]]
    },
    {
      id:'leifeng', name:'雷峰塔景区', priority:1,
      poiId:'B023B09LKR', poiLngLat:[120.148849,30.230934],
      labelLngLat:[120.148849,30.230934], height:3.1,
      outlineKind:'approximate-local-extent',source:'AMap place/text POI; local extent sketched for display',
      polygon:[[120.1472,30.2297],[120.1499,30.2296],[120.1513,30.2306],
        [120.1514,30.2321],[120.1502,30.2332],[120.1483,30.233],
        [120.1474,30.2318]]
    },
    {
      id:'lingyin', name:'灵隐景区', priority:2,
      poiId:'B023B14CB8', poiLngLat:[120.100804,30.240882],
      labelLngLat:[120.100804,30.240882], height:4.8,
      outlineKind:'approximate-local-extent',source:'AMap place/text POI; approximate surrounding area',
      polygon:approximateRing([120.100804,30.240882],.007,.005)
    },
    {
      id:'wushan', name:'吴山景区', priority:5,
      poiId:'B023B17WXC', poiLngLat:[120.165134,30.23412],
      labelLngLat:[120.165134,30.23412], height:4.1,
      outlineKind:'approximate-local-extent',source:'AMap place/text POI; approximate surrounding area',
      polygon:approximateRing([120.165134,30.23412],.004,.0046)
    },
    {
      id:'gushan', name:'孤山', priority:6,
      labelLngLat:[120.1434,30.252], height:3.5,
      outlineKind:'existing-demo-geometry',source:'HZ_REAL_GIS.GUSHAN_ISLAND',
      polygon:gis.GUSHAN_ISLAND
    },
    {
      id:'qianjiang', name:'钱江新城', priority:3,
      labelLngLat:landmark('LM1'), height:8.5,
      outlineKind:'approximate-urban-extent',source:'Existing demo urban cluster and civic-centre landmark',
      polygon:approximateRing([120.209,30.249],.012,.010)
    },
    {
      id:'olympic', name:'奥体博览城', priority:4,
      labelLngLat:landmark('LM2'), height:7.0,
      outlineKind:'approximate-urban-extent',source:'Existing demo Olympic-centre landmark',
      polygon:approximateRing(landmark('LM2'),.007,.0055)
    },
    {
      id:'east-hub', name:'杭州东站枢纽', priority:4,
      labelLngLat:landmark('LM4'), height:5.8,
      outlineKind:'approximate-urban-extent',source:'Existing demo east-station landmark',
      polygon:approximateRing(landmark('LM4'),.0075,.006)
    }
  ];
})();
