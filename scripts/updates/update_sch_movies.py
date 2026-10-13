import re

with open('schedule.html', 'r', encoding='utf-8') as f:
    text = f.read()

old_logic = "let movies = typeof DemoData !== 'undefined' ? DemoData.movies.filter(m => m.status === 'nowShowing').slice(0, 4) : [];"

new_logic = """let allMovies = typeof DemoData !== 'undefined' ? DemoData.movies.filter(m => m.status === 'nowShowing') : [];
                
                // Chọn phim ngẫu nhiên dựa trên ngày
                let seed = parseInt(selectedDateStr.split('-')[2]); 
                let movieCount = (seed % 3) + 2; // Từ 2 đến 4 phim
                
                let movies = [];
                // Nếu là ngày đầu tiên (Today), luôn hiển thị giống hệt bản mẫu
                if (selectedDateStr === dates[0].fullStr) {
                    movies = allMovies.slice(0, 4);
                } else {
                    let startIdx = seed % allMovies.length;
                    for (let i = 0; i < movieCount; i++) {
                        movies.push(allMovies[(startIdx + i) % allMovies.length]);
                    }
                }"""

text = text.replace(old_logic, new_logic)

old_times_logic = "const times = index === 0 ? fixedTimes : generateRandomTimes();"
new_times_logic = "const times = (index === 0 && selectedDateStr === dates[0].fullStr) ? fixedTimes : generateRandomTimes();"

text = text.replace(old_times_logic, new_times_logic)

with open('schedule.html', 'w', encoding='utf-8') as f:
    f.write(text)