const GAME_URL = "https://angel-game-birthday.pages.dev/?v=wx-vn132";

Page({
  data: {
    gameUrl: GAME_URL
  },

  handleLoad() {},

  handleError(error) {
    console.error("Game web-view failed to load", error);
    wx.showModal({
      title: "加载失败",
      content: "游戏网页没有成功打开，请检查网络，或确认小程序后台已经配置业务域名。",
      showCancel: false
    });
  },

  onShareAppMessage() {
    return {
      title: "小天使的选择",
      path: "/pages/game/game"
    };
  },

  onShareTimeline() {
    return {
      title: "小天使的选择"
    };
  }
});
