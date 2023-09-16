// Yukariのbookmarks.jsonのスキーマ
export interface YukariBookmarks {
  version: number; // スキーマバージョン
  SerializeEntity: YukariBookmarkEntity[]; // ブックマークのレコード
}

export interface YukariBookmarkEntity {
  _id: number; // ブックマークした投稿のID (不具合によって誤った値が書き込まれている場合があり、正確なIDはBlobをパースしないと分からない https://github.com/shibafu528/Yukari/issues/240)
  Blob: number[]; // 各バイトを8ビット符号付き整数で表現したバイト列
  ReceiverId: number; // 受信アカウントのTwitter User ID、またはYukariのDB内ID
  SaveDate: number; // 1970-01-01 00:00:00 GMTからの経過ミリ秒数
}
