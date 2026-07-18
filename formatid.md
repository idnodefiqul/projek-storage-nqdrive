# Backend Safe Refactor - Replace Exposed Database IDs with Public IDs (Audit First)

## Objective

Lakukan **audit menyeluruh** terhadap seluruh project backend untuk mencari semua endpoint, service, controller, repository, model, schema, dan response API yang masih mengekspos **primary key database** (`id` berupa integer/auto increment).

**Tujuan refactor ini hanya membuat API lebih profesional dengan menggunakan Public ID (ULID/UUID) tanpa mengubah fungsi aplikasi yang sudah berjalan.**

---

# WAJIB DIIKUTI

## 1. Audit terlebih dahulu

JANGAN langsung mengubah kode.

Pertama lakukan audit dan laporkan:

* Endpoint yang masih mengekspos numeric id
* Entity yang masih memakai id integer sebagai identifier publik
* Service yang menggunakan id integer pada request
* Controller yang menerima parameter id integer
* Response API yang mengembalikan id integer
* Frontend yang masih menggunakan id integer
* File yang akan terdampak

Berikan laporan terlebih dahulu sebelum melakukan refactor.

---

## 2. Jangan mengubah struktur database internal

Primary key database tetap dipakai.

Contoh:

```
id BIGINT AUTO_INCREMENT
```

atau

```
INTEGER PRIMARY KEY
```

tetap dipertahankan.

Jangan mengubah relasi database.

Jangan mengubah foreign key.

Jangan mengubah query internal.

Jangan mengubah migration lama.

---

## 3. Tambahkan Public ID

Tambahkan field baru seperti:

```
public_id
```

atau sesuai entity:

```
userId
adminId
accountId
fileId
folderId
shareId
providerId
taskId
sessionId
```

Gunakan ULID atau UUID.

Contoh:

```
usr_XXXXXXXXXXXXXX   → User
sadm_XXXXXXXXXXXXX   → Super Admin
acc_XXXXXXXXXXXXXX   → Storage Account
fil_XXXXXXXXXXXXXX   → File
fld_XXXXXXXXXXXXXX   → Folder
shr_XXXXXXXXXXXXXX   → Share Link
tsk_XXXXXXXXXXXXXX   → Upload/Transfer Task
prv_XXXXXXXXXXXXXX   → Storage Provider
ses_XXXXXXXXXXXXXX   → Session
api_XXXXXXXXXXXXXX   → API Key
```

Primary key integer tetap hanya digunakan di backend.

Frontend tidak boleh mengetahui primary key database.

---

## 4. Cari seluruh endpoint

Telusuri seluruh project.

Cari endpoint seperti:

```
GET /...
PATCH /...
DELETE /...
POST /...
PUT /...
```

yang masih menggunakan numeric id sebagai identifier publik.

Cari response seperti:

```json
{
    "id": 1
}
```

atau

```json
{
    "id": 18
}
```

atau parameter:

```
/:id
```

yang sebenarnya menggunakan primary key database.

Jika memang itu adalah database id yang diekspos ke frontend, ubah menjadi Public ID.

---

## 5. Response API

Contoh lama

```json
{
    "id": 18,
    "email": "...",
    "provider": "onedrive"
}
```

ubah menjadi

```json
{
    "accountId": "acc_xxxxxxxxx",
    "email": "...",
    "provider": "onedrive"
}
```

Contoh admin

```json
{
    "id": 1,
    "username": "admin"
}
```

ubah menjadi

```json
{
    "adminId": "adm_xxxxxxxxx",
    "username": "admin"
}
```

---

# SANGAT PENTING

## JANGAN MENGUBAH ENDPOINT YANG SUDAH BERJALAN

Ini adalah syarat utama.

DILARANG:

* Mengubah nama endpoint
* Mengubah URL endpoint
* Mengubah HTTP Method
* Mengubah route
* Mengubah flow aplikasi
* Mengubah business logic
* Mengubah autentikasi
* Mengubah authorization
* Mengubah struktur frontend
* Mengubah cara kerja upload
* Mengubah cara kerja download
* Mengubah OAuth
* Mengubah callback
* Mengubah webhook

Refactor hanya identifier publik.

---

## Endpoint berikut HARUS tetap kompatibel

Jangan diubah apabila saat ini sudah berjalan dengan benar.

* Login
* Logout
* Refresh Token
* Session
* OAuth Google
* OAuth OneDrive
* Upload File
* Download File
* Resume Upload
* Share Link
* Public Download
* Queue
* Background Worker
* API Token
* Dashboard
* Security
* Audit Log
* Settings
* Storage Manager

Jika endpoint tersebut tidak mengekspos database id, jangan disentuh.

---

## Download File

Sangat penting.

JANGAN mengubah endpoint download hanya karena proses refactor ini.

JANGAN mengubah:

* URL download
* Cara download bekerja
* Token download
* Share key
* File key
* Hash
* Signature
* Flow download

Jika endpoint download saat ini sudah berjalan normal, BIARKAN APA ADANYA.

Refactor ini tidak boleh menyebabkan download gagal.

---

## Upload File

Jangan mengubah flow upload.

Jangan mengubah chunk upload.

Jangan mengubah resume upload.

Jangan mengubah queue upload.

---

## Share Link

Jangan mengubah share link yang sudah berjalan.

Jika share menggunakan token/hash/public key, jangan diganti.

---

## OAuth

Jangan mengubah redirect URI.

Jangan mengubah callback.

Jangan mengubah credential.

Jangan mengubah flow login.

---

## Authorization

Tetap lakukan validasi kepemilikan resource.

Contoh:

* Edit
* Delete
* Rename
* Refresh Token
* Move
* Restore
* Download

Backend wajib memastikan resource tersebut milik user yang sedang login.

Jangan pernah mempercayai identifier yang dikirim client tanpa validasi.

---

## Storage Manager

Storage Account boleh menggunakan:

```
accountId
```

tetapi backend tetap melakukan mapping ke primary key internal.

---

## Admin

Admin boleh menggunakan:

```
adminId
```

atau

```
userId
```

jika admin berasal dari tabel user.

---

## File

Gunakan:

```
fileId
```

bukan primary key integer.

---

## Folder

Gunakan:

```
folderId
```

---

## Provider

Gunakan:

```
providerId
```

---

## Share

Gunakan:

```
shareId
```

---

## Queue

Gunakan:

```
taskId
```

---

# Kompatibilitas

Pastikan seluruh frontend tetap berjalan.

Jika ada endpoint yang digunakan frontend, ubah seminimal mungkin.

Jangan mengubah nama field selain identifier publik yang memang perlu diganti.

---

# Jika Ragu

Jika menemukan endpoint yang berpotensi merusak:

JANGAN langsung mengubah.

Masukkan ke laporan audit terlebih dahulu.

---

# Output yang saya inginkan

1. Audit lengkap seluruh project.
2. Daftar endpoint yang masih mengekspos primary key database.
3. Daftar entity yang perlu memiliki Public ID.
4. Daftar file yang akan diubah.
5. Penjelasan dampak perubahan.
6. Setelah audit selesai, lakukan refactor secara bertahap.
7. Pastikan seluruh fitur tetap berjalan tanpa perubahan perilaku.

**Prioritas utama adalah menjaga kompatibilitas 100% dengan project yang sudah ada. Jangan melakukan refactor di luar ruang lingkup penggantian identifier publik. Jangan mengubah endpoint download, upload, OAuth, share link, atau endpoint lain yang sudah stabil hanya karena proses ini.**
