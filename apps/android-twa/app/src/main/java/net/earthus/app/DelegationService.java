package net.earthus.app;


import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;

import com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler;


/**
 * 알림·위치 위임 + Play 결제 서비스 (Bubblewrap 생성).
 * 지금 붙은 것: 알림 위임(enableNotifications) + 위치 위임(LocationDelegationExtraCommandHandler)
 *   + DigitalGoodsRequestHandler(웹의 Digital Goods API → Play 결제, features.playBilling — 2026-09-24 PD 결정 Phase 2).
 * (2026-09-24 정정) 예전 'TODO(Phase 2 결제 — 구독료 결정 뒤, PD 보류)'는 이 생성으로 풀렸다. 손으로 넣지 말 것.
 * ⚠️ 삼성 인터넷 기본 기기용 네이티브 Billing 브리지(지시서 §3-1 c)는 만들지 않았다 — TWA 는 Chrome·삼성 인터넷 안의 웹에
 *   JS 객체를 심을 수 없다(웹 prototype/js/play-billing.js 머리 주석). 그 기기에서는 웹이 '앱에서는 결제할 수 없습니다'를 보인다.
 */
public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();

        
            registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());
        
            registerExtraCommandHandler(new DigitalGoodsRequestHandler(getApplicationContext()));
        
    }
}

