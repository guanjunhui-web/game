const GAME_URL = "https://angel-game-birthday-inline.pages.dev/?v=wx-photo-inline-vn133";

Page({
  data: {
    gameUrl: GAME_URL
  },

  handleLoad() {},

  handleError(error) {
    console.error("Game web-view failed to load", error);
    wx.showModal({
      title: "\u52a0\u8f7d\u5931\u8d25",
      content: "\u6e38\u620f\u7f51\u9875\u6ca1\u6709\u6210\u529f\u6253\u5f00\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\uff0c\u6216\u786e\u8ba4\u5c0f\u7a0b\u5e8f\u540e\u53f0\u5df2\u7ecf\u914d\u7f6e\u4e1a\u52a1\u57df\u540d\u3002",
      showCancel: false
    });
  },

  onShareAppMessage() {
    return {
      title: "\u5c0f\u5929\u4f7f\u7684\u9009\u62e9",
      path: "/pages/game/game"
    };
  },

  onShareTimeline() {
    return {
      title: "\u5c0f\u5929\u4f7f\u7684\u9009\u62e9"
    };
  }
});
