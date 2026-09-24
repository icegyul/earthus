package net.earthus.app;


import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;


/**
 * 알림·위치 위임 서비스 (Bubblewrap 생성).
 * 지금 붙은 것: 알림 위임(enableNotifications) + 위치 위임(LocationDelegationExtraCommandHandler).
 * TODO(Phase 2 결제 — 구독료 결정 뒤, 2026-09-24 PD 보류): playBilling 을 켜면 생성기가 여기에
 *   DigitalGoodsRequestHandler 를 등록한다(웹의 Digital Goods API → Play 결제). 손으로 넣지 말 것.
 *   삼성 인터넷 기본 기기용 네이티브 Billing 브리지(지시서 §3-1 c)도 Phase 2 몫이다.
 */
public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();

        
            registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());
        
    }
}

